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
import { expect, type Locator, type Page, test } from "@playwright/test";
import { sealCiphertextSize } from "../src/upload/seal-ciphertext-size";
import { connect } from "./app-actions";
import {
	balance,
	type ChainBlob,
	ownedBlobs,
	quiltPatchIdentifiers,
	SUI_COIN_TYPE,
	walCoinType,
	walrusEpoch,
} from "./chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

/**
 * Real uploads on Testnet with the funded test wallet, each for one epoch
 * and a few bytes, checked against chain over Sui GraphQL (the app writes
 * over gRPC). Every test spends a little SUI and WAL; none deletes a blob.
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
		const sheet = await openSheet(page, [
			file(
				"hello-walrus.txt",
				"Hello, Walrus. One epoch only.\n",
				"text/plain",
			),
		]);
		await expect(sheet.getByText("hello-walrus.txt")).toBeVisible();
		const predicted = await predictedWal(sheet, 1);
		await confirm(sheet, 2);

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
		await clearSelection(page);
		await page.locator('input[data-picker="folder"]').setInputFiles(folder);
		const sheet = await openSheet(page);
		await expect(
			sheet.getByText("→ 1 quilt, 3 files, paths kept"),
		).toBeVisible();
		const predicted = await predictedWal(sheet, 1);
		await confirm(sheet, 2);

		const [item] = await waitForDone(page, ["site/"]);
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

	test("uploads two files as one blob each, certified in one transaction", async () => {
		const spend = await spendTracker(owner, wal);
		const folder = await writeFolder(test.info().outputPath("pair"), {
			"first.txt": "First of two.\n",
			"second.txt": "Second of two.\n",
		});
		await clearSelection(page);
		await page.locator('input[data-picker="folder"]').setInputFiles(folder);
		const sheet = await openSheet(page);
		await sheet.getByText("One blob per file", { exact: true }).click();
		await expect(sheet.getByText("pair/first.txt")).toBeVisible();
		const predicted = await predictedWal(sheet, 1);
		// Two registers and one certify for the batch.
		await confirm(sheet, 3);

		const items = await waitForDone(page, [
			"pair/first.txt",
			"pair/second.txt",
		]);
		const blobs = await Promise.all(
			items.map((item) => chainBlob(owner, item.blobId)),
		);
		for (const blob of blobs) {
			expect(blob.certifiedEpoch).not.toBeNull();
			expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		}
		expect(blobs.map((blob) => blob.attributes.name).sort()).toEqual([
			"pair/first.txt",
			"pair/second.txt",
		]);
		await expectWalSpent(spend, predicted);
	});

	test("encrypts a file with Seal, marks it and decrypts it back", async () => {
		const plaintext = "Sealed on Testnet for one epoch.\n";
		const spend = await spendTracker(owner, wal);
		const sheet = await openSheet(page, [
			file("sealed-note.txt", plaintext, "text/plain"),
		]);
		await sheet.getByRole("switch", { name: /Encrypt with Seal/ }).check();
		await expect(sheet.getByText("→ 1 encrypted blob")).toBeVisible();
		const predicted = await predictedWal(sheet, 1);
		// Register, certify, and the RecipientFile that is the Seal access policy.
		await confirm(sheet, 3);

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
		const sheet = await openSheet(page, [
			file(
				"morse-note.md",
				"# Published from Morse Uploader\n",
				"text/markdown",
			),
		]);
		await sheet.getByRole("switch", { name: /Also publish to Morse/ }).check();
		const picker = sheet.getByRole("combobox", {
			name: "Publication and collection",
		});
		await expect(picker).toBeVisible({ timeout: 60_000 });
		const option = picker
			.locator("option", { hasText: `Claude Testnet Run · ${COLLECTION}` })
			.first();
		await picker.selectOption((await option.getAttribute("value")) ?? "");
		const predicted = await predictedWal(sheet, 1);
		// Register, certify, and one addEntry.
		await confirm(sheet, 3);

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

	test("offers Finish when certify fails after the upload, and Finish certifies", async () => {
		const spend = await spendTracker(owner, wal);
		// A test-only network fault: the second transaction the page submits,
		// the certify, is dropped before it leaves the browser.
		let submissions = 0;
		await page.route(
			"**/sui.rpc.v2.TransactionExecutionService/ExecuteTransaction",
			(route) => {
				submissions += 1;
				return submissions === 2 ? route.abort("failed") : route.continue();
			},
		);
		const sheet = await openSheet(page, [
			file("finish-me.txt", "Certified by Finish.\n", "text/plain"),
		]);
		const predicted = await predictedWal(sheet, 1);
		await confirm(sheet, 2);

		await page.getByRole("tab", { name: /Failed/ }).click();
		const row = queueRow(page, "finish-me.txt");
		await expect(row).toContainText("Certify failed", { timeout: 180_000 });
		await expect(row).toContainText("Finish certifies it");
		const objectId = await row.locator(".detail code").getAttribute("title");
		expect(objectId).toMatch(/^0x[0-9a-f]{64}$/);
		const before = (await ownedBlobs(NETWORK, owner)).find(
			(blob) => blob.objectId === objectId,
		);
		expect(before?.certifiedEpoch).toBeNull();

		await page.unroute(
			"**/sui.rpc.v2.TransactionExecutionService/ExecuteTransaction",
		);
		await row.getByRole("button", { name: "Finish finish-me.txt" }).click();
		const [item] = await waitForDone(page, ["finish-me.txt"]);
		const blob = await chainBlob(owner, item?.blobId);
		expect(blob.objectId).toBe(objectId);
		expect(blob.certifiedEpoch).not.toBeNull();
		expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		await expectWalSpent(spend, predicted);
	});

	test("has no horizontal overflow at 390 with the queue populated", async () => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.getByRole("tab", { name: /Done/ }).click();
		await expect(page.locator("tr.q.done").first()).toBeVisible();
		expect(await overflow(page)).toEqual({ fits: true });
		await page.setViewportSize({ width: 1440, height: 900 });
	});
});

test.describe("the upload sheet on a phone", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the upload tests.`);

	test("has no horizontal overflow at 390 with the sheet open; nothing is signed", async ({
		page,
	}) => {
		const keypair = funded as Keypair;
		await page.setViewportSize({ width: 390, height: 844 });
		await installTestWallet(page, [keypair]);
		await page.goto("/app");
		await connect(page, keypair.toSuiAddress());
		const sheet = await openSheet(page, [
			file("mobile.txt", "Not uploaded.\n", "text/plain"),
		]);
		await expect(
			sheet.getByRole("button", { name: /Upload · sign 2 times/ }),
		).toBeVisible({ timeout: 60_000 });
		expect(await overflow(page)).toEqual({ fits: true });
		await sheet.getByRole("button", { name: "Cancel" }).click();
		await expect(sheet).toBeHidden();
	});
});

interface DoneItem {
	blobId: string;
	recipientFile: string | null;
	entryId: number | undefined;
}

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

/** Opens the sheet: with files, through the picker behind Upload; without, for the selection. */
async function openSheet(
	page: Page,
	files?: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<Locator> {
	if (files) {
		await clearSelection(page);
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await (await chooser).setFiles(files);
	} else {
		await page.getByRole("button", { name: "Upload", exact: true }).click();
	}
	const sheet = page.getByRole("dialog", {
		name: /Upload \d+ items? to Walrus/,
	});
	await expect(sheet).toBeVisible();
	return sheet;
}

/**
 * Clears the local pane's selection, so Upload opens the picker or takes
 * only new files. Phones have no local pane; there it has nothing to clear.
 */
async function clearSelection(page: Page): Promise<void> {
	const local = page.getByRole("region", { name: "This computer" });
	if (!(await local.isVisible())) return;
	const selectAll = local.getByRole("button", { name: "Select all" });
	// With part of the list selected, select everything first: then Select none clears it all.
	if ((await selectAll.isVisible()) && (await selectAll.isEnabled()))
		await selectAll.click();
	const selectNone = local.getByRole("button", { name: "Select none" });
	if (await selectNone.isVisible()) await selectNone.click();
	await expect(local.locator(".ft")).toContainText("Nothing selected");
}

/** Sets the period to `epochs` and reads the WAL the sheet predicts, in FROST. */
async function predictedWal(sheet: Locator, epochs: number): Promise<bigint> {
	await sheet.getByRole("spinbutton").fill(String(epochs));
	await expect(sheet.getByText(`Storage, ${epochs} epoch`)).toBeVisible();
	await expect(sheet.getByText(/≈/).first()).toBeVisible({ timeout: 60_000 });
	const amount = async (label: RegExp) =>
		toFrost(
			await sheet
				.locator(".cost dt", { hasText: label })
				.locator("xpath=following-sibling::dd")
				.evaluate(
					(dd) => (dd.querySelector(".sr-only") ?? dd).textContent ?? "",
				),
		);
	return (await amount(/^Storage/)) + (await amount(/^Write fee/));
}

function toFrost(text: string): bigint {
	const match = /(\d+)(?:\.(\d+))?/.exec(text.replaceAll(",", ""));
	if (!match) throw new Error(`No amount in "${text}".`);
	return (
		BigInt(match[1] ?? "0") * 1_000_000_000n +
		BigInt((match[2] ?? "").padEnd(9, "0"))
	);
}

async function confirm(sheet: Locator, signatures: number): Promise<void> {
	const upload = sheet.getByRole("button", {
		name: `Upload · sign ${signatures} times`,
	});
	await expect(upload).toBeEnabled({ timeout: 60_000 });
	await upload.click();
	await expect(sheet).toBeHidden();
}

function queueRow(page: Page, name: string): Locator {
	return page
		.locator("tr.q", { has: page.locator(".label", { hasText: name }) })
		.last();
}

/** Waits until each named item is done, from the Done tab, and reads what it shows. */
async function waitForDone(
	page: Page,
	names: readonly string[],
): Promise<DoneItem[]> {
	await page.getByRole("tab", { name: /Done/ }).click();
	const items: DoneItem[] = [];
	for (const name of names) {
		const row = queueRow(page, name);
		await expect(row).toHaveClass(/done/, { timeout: 240_000 });
		const blobId = await row.locator(".id [title]").getAttribute("title");
		if (!blobId) throw new Error(`${name} shows no blob id.`);
		const entry = await row
			.locator("[data-entry-id]")
			.getAttribute("data-entry-id", { timeout: 1_000 })
			.catch(() => null);
		items.push({
			blobId,
			recipientFile: await row
				.locator("[data-recipient-file]")
				.getAttribute("data-recipient-file", { timeout: 1_000 })
				.catch(() => null),
			entryId: entry === null ? undefined : Number(entry),
		});
	}
	return items;
}

async function chainBlob(
	owner: string,
	blobId: string | undefined,
): Promise<ChainBlob> {
	let found: ChainBlob | undefined;
	await expect
		.poll(
			async () => {
				found = (await ownedBlobs(NETWORK, owner)).find(
					(blob) => blob.blobId === blobId,
				);
				return found?.certifiedEpoch ?? null;
			},
			{ timeout: 60_000 },
		)
		.not.toBeNull();
	if (!found) throw new Error(`Blob ${blobId} is not owned by ${owner}.`);
	return found;
}

/** The blob's row in the Walrus pane, found by searching its blob id. */
async function expectListed(page: Page, blob: ChainBlob): Promise<void> {
	const search = page.getByRole("searchbox", { name: /Search blobs/ });
	await search.fill(blob.blobId);
	await expect(
		page.locator(`.pane.remote tr[data-key="${blob.objectId}"]`),
	).toBeVisible({ timeout: 60_000 });
	await search.fill("");
}

async function aggregatorBytes(blobId: string): Promise<Uint8Array> {
	let bytes: Uint8Array | null = null;
	await expect
		.poll(
			async () => {
				const response = await fetch(
					`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
				);
				if (!response.ok) return response.status;
				bytes = new Uint8Array(await response.arrayBuffer());
				return 200;
			},
			{ timeout: 90_000, intervals: [2_000, 5_000] },
		)
		.toBe(200);
	if (!bytes) throw new Error(`The aggregator did not serve ${blobId}.`);
	return bytes;
}

interface Spend {
	owner: string;
	wal: string;
	walBefore: bigint;
	suiBefore: bigint;
	epoch: number;
}

async function spendTracker(owner: string, wal: string): Promise<Spend> {
	const [walBefore, suiBefore, { epoch }] = await Promise.all([
		balance(NETWORK, owner, wal),
		balance(NETWORK, owner, SUI_COIN_TYPE),
		walrusEpoch(NETWORK),
	]);
	return { owner, wal, walBefore, suiBefore, epoch };
}

/**
 * The WAL the uploads spent equals what the sheet predicted. The tolerance
 * is 1%, for a price vote landing between the quote and the register; in
 * practice the two are equal to the FROST.
 */
async function expectWalSpent(spend: Spend, predicted: bigint): Promise<void> {
	let spent = 0n;
	await expect
		.poll(
			async () => {
				spent =
					spend.walBefore - (await balance(NETWORK, spend.owner, spend.wal));
				return spent > 0n;
			},
			{ timeout: 30_000 },
		)
		.toBe(true);
	const suiSpent =
		spend.suiBefore - (await balance(NETWORK, spend.owner, SUI_COIN_TYPE));
	test.info().annotations.push({
		type: "spend",
		description: `WAL predicted ${predicted}, spent ${spent} FROST; SUI spent ${suiSpent} MIST`,
	});
	const difference = spent > predicted ? spent - predicted : predicted - spent;
	expect(difference * 100n).toBeLessThanOrEqual(predicted);
}

async function overflow(page: Page): Promise<{ fits: boolean }> {
	return page.evaluate(() => ({
		fits: document.documentElement.scrollWidth === window.innerWidth,
	}));
}
