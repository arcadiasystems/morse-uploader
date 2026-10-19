import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	buildRecipientFileSealId,
	DefaultSealAdapter,
	morseConfig,
	RECOMMENDED_SEAL_PREFIX_BYTES,
	RpcPublicationReader,
	toPublicationId,
	toRecipientFileId,
	toSuiAddress,
} from "@arcadiasystems/morse-sdk";
import { EncryptedObject, SessionKey } from "@mysten/seal";
import type { Keypair } from "@mysten/sui/cryptography";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { fromHex } from "@mysten/sui/utils";
import { expect, type Page, test } from "@playwright/test";
import { sealCiphertextSize } from "../src/upload/seal-ciphertext-size";
import { connect } from "./app-actions";
import { type ChainBlob, quiltPatchIdentifiers, walCoinType } from "./chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";
import {
	aggregatorBytes,
	chainBlob,
	expectWalSpent,
	openSetting,
	overflow,
	predictedWal,
	signAndSend,
	spendTracker,
	stageFiles,
	stageFolder,
	stagingTray,
	trayItem,
	waitForDone,
} from "./upload-actions";

/**
 * Real uploads on Testnet with the funded test wallet, staged in the tray
 * and sent with Sign and send, each for one epoch and a few bytes, checked
 * against chain over Sui GraphQL (the app writes over gRPC). Every test
 * spends a little SUI and WAL; none deletes a blob. The transfers spec
 * covers batches, Pause, Retry now and Finish.
 */
const funded = keypairFromEnv();
const NETWORK = "testnet";
/** The publication and blob collection an earlier morse-cli run created for the test wallet. */
const PUBLICATION_SLUG_PREFIX = "claude-testnet-run-";
/**
 * Written into every uploaded file, so each run makes new blob ids: blob ids
 * are content addresses, and a check must not find an earlier run's blob.
 */
const RUN = `run ${Date.now().toString(36)}\n`;
const COLLECTION = "notes";

test.describe("uploads on Testnet", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the upload tests.`);
	test.describe.configure({ mode: "serial", timeout: 300_000 });

	let page: Page;
	let owner: string;
	let wal: string;

	test.beforeAll(async ({ browser }) => {
		const keypair = funded as Keypair;
		owner = keypair.toSuiAddress();
		wal = await walCoinType(NETWORK);
		page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await installTestWallet(page, [keypair]);
		await page.goto("/app");
		await connect(page, owner);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test("uploads one small public file for one epoch", async () => {
		const spend = await spendTracker(owner, wal);
		const tray = await stageFiles(page, [
			file(
				"hello-walrus.txt",
				"Hello, Walrus. One epoch only.\n",
				"text/plain",
			),
		]);
		await expect(trayItem(tray, "hello-walrus.txt")).toContainText("1 blob");
		const predicted = await predictedWal(tray, 1);
		await signAndSend(page, 2);

		const [item] = await waitForDone(page, ["hello-walrus.txt"]);
		const blob = await chainBlob(owner, item?.blobId);
		expect(blob.certifiedEpoch).not.toBeNull();
		expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		expect(blob.attributes).toMatchObject({
			name: "hello-walrus.txt",
			"content-type": "text/plain",
		});
		expect(blob.deletable).toBe(true);
		await expectWalSpent(spend, predicted);
		await expectListed(page, blob);
	});

	test("uploads a folder as one quilt with its paths", async () => {
		const spend = await spendTracker(owner, wal);
		const folder = await writeFolder(test.info().outputPath("site"), {
			"index.html": "<h1>Quilt</h1>\n",
			"about.txt": "About this quilt.\n",
			"assets/a.txt": "An asset.\n",
		});
		const tray = await stageFolder(page, folder);
		await expect(trayItem(tray, "site/")).toContainText(
			"3 files → 1 quilt, paths kept",
		);
		const predicted = await predictedWal(tray, 1);
		await signAndSend(page, 2);

		const [item] = await waitForDone(page, ["site"]);
		const blob = await chainBlob(owner, item?.blobId);
		expect(blob.certifiedEpoch).not.toBeNull();
		expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		expect(blob.attributes).toMatchObject({
			_walrusBlobType: "quilt",
			name: "site",
		});
		await expect
			.poll(() => quiltPatchIdentifiers(NETWORK, blob.blobId), {
				timeout: 60_000,
			})
			.toEqual(["about.txt", "assets/a.txt", "index.html"]);
		await expectWalSpent(spend, predicted);
		await expectListed(page, blob);
	});

	test("encrypts a file with Seal, marks it and decrypts it back", async () => {
		const plaintext = "Sealed on Testnet for one epoch.\n";
		const spend = await spendTracker(owner, wal);
		const tray = await stageFiles(page, [
			file("sealed-note.txt", plaintext, "text/plain"),
		]);
		await openSetting(tray, "Encryption");
		await tray.getByRole("switch", { name: /Encrypt with Seal/ }).check();
		await expect(trayItem(tray, "sealed-note.txt")).toContainText(
			"1 encrypted blob",
		);
		const predicted = await predictedWal(tray, 1);
		// Register, certify, and the RecipientFile that is the Seal access policy.
		await signAndSend(page, 3);

		const [item] = await waitForDone(page, ["sealed-note.txt"]);
		const blob = await chainBlob(owner, item?.blobId);
		const config = morseConfig({ network: NETWORK });
		expect(blob.certifiedEpoch).not.toBeNull();
		expect(blob.attributes).toEqual({
			name: "sealed-note.txt",
			seal: config.originalPackageId,
		});
		expect(Number(blob.size)).toBe(
			sealCiphertextSize(Buffer.byteLength(plaintext + RUN), {
				keyServers: config.sealKeyServers.length,
				identityBytes: 49,
			}),
		);
		await expectWalSpent(spend, predicted);

		// The ciphertext as the aggregator serves it, decrypted here with the
		// test key through the RecipientFile policy.
		const fileId = item?.recipientFile;
		if (!fileId)
			throw new Error("No RecipientFile was shown for the encrypted upload.");
		const ciphertext = await aggregatorBytes(blob.blobId);
		const client = new SuiGrpcClient({
			network: NETWORK,
			baseUrl: config.rpcUrl,
		});
		const sessionKey = await SessionKey.create({
			address: owner,
			packageId: config.originalPackageId ?? config.packageId,
			ttlMin: 10,
			signer: funded as Keypair,
			suiClient: client,
		});
		const seal = DefaultSealAdapter.fromMorseConfig(config, {}, client);
		// The identity travels in the ciphertext: prefix || tag (1 byte) || nonce.
		const identity = fromHex(EncryptedObject.parse(ciphertext).id);
		const decrypted = await seal.decryptUnderRecipientFile(ciphertext, {
			sessionKey,
			sealId: buildRecipientFileSealId(
				identity.slice(0, RECOMMENDED_SEAL_PREFIX_BYTES),
				identity.slice(RECOMMENDED_SEAL_PREFIX_BYTES + 1),
			),
			fileId: toRecipientFileId(fileId),
		});
		expect(new TextDecoder().decode(decrypted)).toBe(plaintext + RUN);
	});

	test("also publishes to a Morse blob collection the wallet writes to", async () => {
		const spend = await spendTracker(owner, wal);
		const tray = await stageFiles(page, [
			file(
				"morse-note.md",
				"# Published from Morse Uploader\n",
				"text/markdown",
			),
		]);
		// The tray keeps its settings: the last upload turned Seal on.
		await openSetting(tray, "Encryption");
		await tray.getByRole("switch", { name: /Encrypt with Seal/ }).uncheck();
		await openSetting(tray, "Also publish");
		await tray.getByRole("switch", { name: /Also publish to Morse/ }).check();
		const picker = tray.getByRole("combobox", {
			name: "Publication and collection",
		});
		await expect(picker).toBeVisible({ timeout: 60_000 });
		const option = picker
			.locator("option", { hasText: `Claude Testnet Run · ${COLLECTION}` })
			.first();
		await picker.selectOption((await option.getAttribute("value")) ?? "");
		const predicted = await predictedWal(tray, 1);
		// Register, certify, and one addEntry.
		await signAndSend(page, 3);

		const [item] = await waitForDone(page, ["morse-note.md"]);
		const blob = await chainBlob(owner, item?.blobId);
		expect(blob.certifiedEpoch).not.toBeNull();
		await expectWalSpent(spend, predicted);

		const entryId = item?.entryId;
		if (entryId === undefined) throw new Error("No Morse entry was shown.");
		const config = morseConfig({ network: NETWORK });
		const client = new SuiGrpcClient({
			network: NETWORK,
			baseUrl: config.rpcUrl,
		});
		const reader = RpcPublicationReader.fromMorseConfig(config, client);
		const caps = await reader.listPublisherCapsOwnedBy(toSuiAddress(owner), {
			limit: 50,
		});
		let publicationId: string | null = null;
		for (const cap of caps.results) {
			const publication = await reader
				.getPublication(cap.publicationId)
				.catch(() => null);
			if (publication?.slug.startsWith(PUBLICATION_SLUG_PREFIX))
				publicationId = publication.id;
		}
		if (!publicationId)
			throw new Error(
				"The test wallet's Claude Testnet Run publication is gone.",
			);
		const entry = await reader.getEntry(
			toPublicationId(publicationId),
			COLLECTION,
			entryId,
		);
		expect(entry.name).toBe("morse-note.md");
		const revision = entry.revisions.at(-1);
		expect(revision?.blobRef).toEqual({
			kind: "blob",
			blobObjectId: blob.objectId,
		});
		expect(revision?.contentType).toBe("text/markdown");
	});
});

test.describe("the staging tray on a phone", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the upload tests.`);

	test("has no horizontal overflow at 390 with a file staged; nothing is signed", async ({
		page,
	}) => {
		const keypair = funded as Keypair;
		await page.setViewportSize({ width: 390, height: 844 });
		await installTestWallet(page, [keypair]);
		await page.goto("/app");
		await connect(page, keypair.toSuiAddress());
		const tray = await stageFiles(page, [
			file("mobile.txt", "Not uploaded.\n", "text/plain"),
		]);
		await expect(
			tray.getByRole("button", { name: "Sign and send · 2 signatures" }),
		).toBeVisible({ timeout: 60_000 });
		expect(await overflow(page)).toEqual({ fits: true });
		await tray.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(stagingTray(page)).toBeHidden();
	});
});

function file(name: string, text: string, mimeType: string) {
	return { name, mimeType, buffer: Buffer.from(text + RUN) };
}

async function writeFolder(
	root: string,
	files: Record<string, string>,
): Promise<string> {
	for (const [path, text] of Object.entries(files)) {
		const target = join(root, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, text + RUN);
	}
	return root;
}

/** The blob's row in Files, found with the Files filter box by its blob id. */
async function expectListed(page: Page, blob: ChainBlob): Promise<void> {
	// The filter box lives on the Files view; the suite starts on the Overview.
	await page.evaluate(() => {
		window.location.hash = "#files";
	});
	const search = page.getByRole("searchbox", { name: /Search blobs/ });
	await search.fill(blob.blobId);
	await expect(
		page.locator(`table.tbl tr[data-key="${blob.objectId}"]`),
	).toBeVisible({ timeout: 60_000 });
	await search.fill("");
}
