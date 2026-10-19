import { readFile } from "node:fs/promises";
import {
	morseConfig,
	NotFoundError,
	quiltPatchIdToString,
	RpcPublicationReader,
	RpcRecipientFilesReader,
	toPublicationId,
	toRecipientFileId,
	toSuiAddress,
} from "@arcadiasystems/morse-sdk";
import type { Keypair } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { expect, type Page, test } from "@playwright/test";
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
import {
	AGGREGATOR,
	annotateTransaction,
	extendCost,
	inspector,
	isPlain,
	liveCertified,
	nodeClient,
	openInspector,
	registerWithoutCertify,
	tinyPng,
	toDecimal,
} from "./inspector-actions";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";
import {
	chainBlob,
	expectWalSpent,
	openSetting,
	predictedWal,
	type Spend,
	signAndSend,
	spendTracker,
	stageFiles,
	toFrost,
	waitForDone,
} from "./upload-actions";

/**
 * The inspector against Testnet with the funded test wallet: phase 4's
 * drawer suite, ported, plus a quilt's files by path and its entries.
 * Fixtures are picked from chain when each test runs, because Testnet blobs
 * expire. Real writes are small: one-epoch extends, one auto-extend cycle
 * under a tight cap, one Morse entry, one quilt's entries in one
 * transaction, one recipient, one tiny upload and two Finishes. Delete is
 * only ever simulated: no test presses the button that signs it.
 */
const funded = keypairFromEnv();
const NETWORK = "testnet";
const RUN = `run ${Date.now().toString(36)}`;
/** The phase 3 encrypted upload and its RecipientFile (PR #8). */
const SEALED_BLOB =
	"0x5d9412aaa64c40b469c5231306bc1f474cf6d8acf625cff85629b5784584217f";
const SEALED_TEXT = "Sealed on Testnet for one epoch.";
const PUBLICATION_SLUG_PREFIX = "claude-testnet-run-";
const COLLECTION = "notes";
/** The Claude Testnet Run publication's quilt collection. */
const QUILT_COLLECTION = "gallery";

test.describe("inspector on Testnet", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the inspector tests.`);
	test.describe.configure({ mode: "serial", timeout: 300_000 });

	let page: Page;
	let owner: string;
	let wal: string;
	/** Transactions the page submits, to prove Delete never sends one. */
	let submitted = 0;

	test.beforeAll(async ({ browser }) => {
		const keypair = funded as Keypair;
		owner = keypair.toSuiAddress();
		wal = await walCoinType(NETWORK);
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			permissions: ["clipboard-read", "clipboard-write"],
			acceptDownloads: true,
		});
		page = await context.newPage();
		page.on("request", (request) => {
			if (
				request.url().includes("TransactionExecutionService/ExecuteTransaction")
			)
				submitted += 1;
		});
		await installTestWallet(page, [keypair]);
		await page.goto("/app#files");
		await connect(page, owner);
		await page.keyboard.press("Escape");
		await expect(page.getByRole("treegrid")).toBeVisible({ timeout: 90_000 });
	});

	test.afterAll(async () => {
		await page.context().close();
	});

	async function chain(): Promise<{ blobs: ChainBlob[]; epoch: number }> {
		const [blobs, { epoch }] = await Promise.all([
			ownedBlobs(NETWORK, owner),
			walrusEpoch(NETWORK),
		]);
		return { blobs, epoch };
	}

	async function refreshList(): Promise<void> {
		const refresh = page
			.getByRole("region", { name: "Files" })
			.getByRole("button", { name: "Refresh" });
		await refresh.click();
		await expect(refresh).toBeEnabled({ timeout: 60_000 });
	}

	test("decrypts the Seal-encrypted blob for its owner", async () => {
		const { blobs, epoch } = await chain();
		const encrypted = liveCertified(blobs, epoch)
			.filter((blob) => blob.attributes.seal)
			.sort(
				(a, b) =>
					Number(b.objectId === SEALED_BLOB) -
					Number(a.objectId === SEALED_BLOB),
			);
		let fileId: string | null = null;
		let chosen: ChainBlob | null = null;
		for (const blob of encrypted.slice(0, 4)) {
			const panel = await openInspector(page, blob.objectId);
			const policy = panel.locator(".note", { hasText: /^RecipientFile/ });
			const none = panel.getByText(/None of this wallet's RecipientFiles/);
			await expect(policy.or(none)).toBeVisible({ timeout: 90_000 });
			if (await policy.isVisible()) {
				fileId = await policy.locator("a").getAttribute("title");
				chosen = blob;
				test.info().annotations.push({
					type: "fixture",
					description: `encrypted blob ${blob.objectId}, RecipientFile ${fileId}`,
				});
				break;
			}
		}
		if (!fileId) throw new Error("No live encrypted blob has a RecipientFile.");

		// One personal-message signature, no transaction: nothing is paid.
		const before = submitted;
		const download = page.waitForEvent("download");
		await inspector(page)
			.getByRole("button", { name: "Decrypt and download" })
			.click();
		const saved = await download;
		const text = await readFile((await saved.path()) ?? "", "utf8");
		if (chosen?.objectId === SEALED_BLOB) expect(text).toContain(SEALED_TEXT);
		await expect(inspector(page).locator(".thumb pre")).toContainText(
			text.trim().split("\n")[0] ?? "",
		);
		await expect(
			inspector(page).getByText(/Decrypted in this browser/),
		).toBeVisible();
		expect(submitted).toBe(before);

		// The policy the inspector found, read independently: the owner is a member.
		const config = morseConfig({ network: NETWORK });
		const file = await RpcRecipientFilesReader.fromConfig(nodeClient(), {
			packageId: config.packageId,
		}).getRecipientFile(toRecipientFileId(fileId));
		expect(file.members).toContain(toSuiAddress(owner));
	});

	test("adds a recipient to the RecipientFile", async () => {
		const panel = inspector(page);
		const fileId = await panel
			.locator(".note", { hasText: /^RecipientFile/ })
			.locator("a")
			.getAttribute("title");
		if (!fileId) throw new Error("The inspector shows no RecipientFile.");
		const recipient = new Ed25519Keypair().toSuiAddress();
		const spend = await spendTracker(owner, wal);
		await panel
			.getByRole("textbox", { name: "Add a wallet that can decrypt this file" })
			.fill(recipient);
		await panel.getByRole("button", { name: "Add recipient · 1 tx" }).click();
		await expect(panel.getByText(/^Added 0x/)).toBeVisible({ timeout: 90_000 });
		await annotateTransaction(panel.getByText(/^Added 0x/), "add recipient");

		const config = morseConfig({ network: NETWORK });
		const reader = RpcRecipientFilesReader.fromConfig(nodeClient(), {
			packageId: config.packageId,
		});
		await expect
			.poll(
				async () =>
					(await reader.getRecipientFile(toRecipientFileId(fileId))).members,
			)
			.toContain(toSuiAddress(recipient));
		await expect(panel.locator(".members")).toContainText(
			`${recipient.slice(0, 6)}…${recipient.slice(-4)}`,
		);
		await expectSuiOnly(spend);
	});

	test("shares a quilt file: the aggregator serves the bytes storage nodes hold", async () => {
		const { blobs, epoch } = await chain();
		const quilt = liveCertified(blobs, epoch).find(
			(blob) => blob.attributes._walrusBlobType === "quilt",
		);
		if (!quilt) throw new Error("The test wallet owns no live quilt.");
		const listed = await fetch(
			`${AGGREGATOR}/v1/quilts/${quilt.blobId}/patches`,
		);
		const patches = (await listed.json()) as {
			identifier: string;
			patch_id: string;
		}[];
		const [first] = patches;
		if (!first) throw new Error(`Quilt ${quilt.blobId} lists no files.`);
		expect(await quiltPatchIdentifiers(NETWORK, quilt.blobId)).toContain(
			first.identifier,
		);

		const panel = await openInspector(page, quilt.objectId, first.identifier);
		await expect(panel.locator("h3")).toHaveText(first.identifier);
		const link = panel.getByRole("textbox", { name: "Aggregator link" });
		await expect(link).toHaveValue(
			`${AGGREGATOR}/v1/blobs/by-quilt-patch-id/${first.patch_id}`,
			{ timeout: 60_000 },
		);
		await panel.getByRole("button", { name: "Copy aggregator link" }).click();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			await link.inputValue(),
		);

		// The link's bytes against the same file read from storage nodes by the SDK.
		const served = new Uint8Array(
			await (await fetch(await link.inputValue())).arrayBuffer(),
		);
		const [file] = await nodeClient().walrus.getFiles({
			ids: [first.patch_id],
		});
		if (!file) throw new Error("The SDK returned no file for the patch id.");
		expect(Buffer.from(served).equals(Buffer.from(await file.bytes()))).toBe(
			true,
		);
		await expect(panel.getByRole("textbox", { name: "Embed" })).toHaveValue(
			new RegExp(first.patch_id),
		);
		await expect(panel.getByText(/No Walrus Site link/)).toBeVisible();
	});

	test("lists a quilt's files by path and adds them to Morse in one transaction", async () => {
		const { blobs, epoch } = await chain();
		const quilt = liveCertified(blobs, epoch)
			.filter(
				(blob) => blob.attributes._walrusBlobType === "quilt" && blob.deletable,
			)
			.sort((a, b) => b.endEpoch - a.endEpoch)[0];
		if (!quilt)
			throw new Error("The test wallet owns no live deletable quilt.");
		const patches = (await (
			await fetch(`${AGGREGATOR}/v1/quilts/${quilt.blobId}/patches`)
		).json()) as { identifier: string; patch_id: string }[];
		expect(patches.length).toBeGreaterThan(0);
		test.info().annotations.push({
			type: "fixture",
			description: `quilt ${quilt.objectId} with ${patches.length} files`,
		});

		const panel = await openInspector(page, quilt.objectId);
		await panel.getByRole("button", { name: "Files", exact: true }).click();
		const files = panel.locator("#insp-files");
		for (const patch of patches.slice(0, 4)) {
			const link = files.getByRole("link", {
				name: `Open ${patch.identifier} on the aggregator`,
			});
			const href = `${AGGREGATOR}/v1/blobs/by-quilt-id/${quilt.blobId}/${encodeURIComponent(patch.identifier)}`;
			await expect(link).toHaveAttribute("href", href);
			// The path address serves the same bytes as the file's patch id.
			const [byPath, byPatch] = await Promise.all(
				[
					href,
					`${AGGREGATOR}/v1/blobs/by-quilt-patch-id/${patch.patch_id}`,
				].map(async (url) => {
					const response = await fetch(url);
					expect(response.status, url).toBe(200);
					return Buffer.from(await response.arrayBuffer());
				}),
			);
			expect(byPath?.equals(byPatch ?? Buffer.alloc(0))).toBe(true);
		}

		// Walrus Sites deploy is not built: it shows, disabled, as coming.
		const publish = panel.locator("#insp-publish");
		await expect(
			publish.getByRole("button", { name: /Deploy as site/ }),
		).toBeDisabled();
		await expect(
			publish.getByText("Walrus Sites deploy is coming."),
		).toBeVisible();

		const picker = publish.getByRole("combobox", {
			name: "Publication and collection",
		});
		await expect(picker).toBeVisible({ timeout: 90_000 });
		const option = picker
			.locator("option", {
				hasText: `Claude Testnet Run · ${QUILT_COLLECTION}`,
			})
			.first();
		await picker.selectOption((await option.getAttribute("value")) ?? "");
		const count = patches.length;
		const add = publish.getByRole("button", {
			name: `Add ${count === 1 ? "1 entry" : `${count} entries`} · 1 signature`,
		});
		const spend = await spendTracker(owner, wal);
		const before = submitted;
		await add.click();
		const done = publish.getByText(
			new RegExp(
				`^Added ${count === 1 ? "1 entry" : `${count} entries`} in Claude Testnet Run`,
			),
		);
		await expect(done).toBeVisible({ timeout: 120_000 });
		expect(submitted - before).toBe(1);
		const [, first, last] =
			/entries (\d+) to (\d+)/.exec((await done.textContent()) ?? "") ?? [];
		await annotateTransaction(done, "quilt entries");

		const config = morseConfig({ network: NETWORK });
		const reader = RpcPublicationReader.fromMorseConfig(config, nodeClient());
		const publicationId = await claudeRunPublication(reader, owner);
		const ids = Array.from(
			{ length: Number(last) - Number(first) + 1 },
			(_, index) => Number(first) + index,
		);
		expect(ids).toHaveLength(count);
		const entries = await Promise.all(
			ids.map((id) =>
				reader.getEntry(toPublicationId(publicationId), QUILT_COLLECTION, id),
			),
		);
		expect(
			entries.map((entry) => {
				const ref = entry.revisions.at(-1)?.blobRef;
				return [
					entry.name,
					ref?.kind === "quilt" ? quiltPatchIdToString(ref.patchId) : null,
				];
			}),
		).toEqual(patches.map((patch) => [patch.identifier, patch.patch_id]));
		await expectSuiOnly(spend);
	});

	test("verifies a live blob and shares a link the aggregator serves", async () => {
		const { blobs, epoch } = await chain();
		const target = liveCertified(blobs, epoch)
			.filter(
				(blob) =>
					isPlain(blob) && blob.attributes["content-type"] && blob.size < 1000n,
			)
			.sort((a, b) => b.endEpoch - a.endEpoch)[0];
		if (!target) throw new Error("The test wallet owns no live plain blob.");
		const panel = await openInspector(page, target.objectId);

		await panel.getByRole("button", { name: "Verify", exact: true }).click();
		const result = panel.locator("#insp-verify .ver");
		await expect(result).toContainText(
			"Bytes match the blob id. Rebuilt from storage nodes just now.",
			{ timeout: 120_000 },
		);
		await expect(result).toContainText(`${target.size} B rebuilt`);
		await expect(result).not.toContainText(/\d+ storage nodes/);

		const link = panel.getByRole("textbox", { name: "Aggregator link" });
		await expect(link).toHaveValue(`${AGGREGATOR}/v1/blobs/${target.blobId}`);
		const served = new Uint8Array(
			await (await fetch(await link.inputValue())).arrayBuffer(),
		);
		// The served bytes encode to the blob's own id, recomputed in this process.
		const { blobId } = await nodeClient().walrus.computeBlobMetadata({
			bytes: served,
		});
		expect(blobId).toBe(target.blobId);
		await expect(
			panel.getByRole("textbox", { name: "With its file type and name" }),
		).toHaveValue(`${AGGREGATOR}/v1/blobs/by-object-id/${target.objectId}`);
	});

	test("extends a blob by one epoch, and chain shows the new end", async () => {
		const { blobs, epoch } = await chain();
		const live = liveCertified(blobs, epoch).filter(
			(blob) => blob.endEpoch - epoch < 53,
		);
		// The phase 3 sealed note when it is live, so its decrypt test stays possible.
		const target =
			live.find((blob) => blob.objectId === SEALED_BLOB) ??
			live.sort((a, b) => a.endEpoch - b.endEpoch)[0];
		if (!target) throw new Error("The test wallet owns no blob to extend.");
		test.info().annotations.push({
			type: "fixture",
			description: `extend ${target.objectId} from end epoch ${target.endEpoch}`,
		});
		const panel = await openInspector(page, target.objectId);
		// The action row's Extend opens the extend panel in Storage.
		await panel
			.getByRole("region", { name: "Actions" })
			.getByRole("button", { name: "Extend", exact: true })
			.click();
		const storage = panel.locator("#insp-storage");
		await expect(
			storage.getByRole("spinbutton", { name: "Extend by" }),
		).toHaveValue("1");
		const cost = storage.locator(".cost dt", { hasText: /^Storage, 1 epoch/ });
		await expect(cost).toBeVisible();
		// The cost shows once the live price is read.
		let shown = "";
		await expect
			.poll(async () => {
				shown = await cost
					.locator("xpath=following-sibling::dd")
					.evaluate(
						(dd) => (dd.querySelector(".sr-only") ?? dd).textContent ?? "",
					);
				return /\d/.test(shown);
			})
			.toBe(true);
		const predicted = toFrost(shown);
		const { storage_price_per_unit_size: price } =
			await nodeClient().walrus.systemState();
		expect(predicted).toBe(extendCost(target.encodedSize, 1, BigInt(price)));

		const spend = await spendTracker(owner, wal);
		const sign = storage.getByRole("button", { name: /^Extend 1 epoch/ });
		await expect(sign).toBeEnabled({ timeout: 60_000 });
		await sign.click();
		await expect(storage.getByText(/^Extended\./)).toContainText(
			`Storage now ends at epoch ${target.endEpoch + 1}.`,
			{ timeout: 90_000 },
		);
		await annotateTransaction(storage.getByText(/^Extended\./), "extend");
		await expect
			.poll(
				async () =>
					(await ownedBlobs(NETWORK, owner)).find(
						(blob) => blob.objectId === target.objectId,
					)?.endEpoch,
				{ timeout: 60_000 },
			)
			.toBe(target.endEpoch + 1);
		await expectWalSpent(spend, predicted);
	});

	test("runs one auto-extend cycle, renewing only what the WAL cap allows", async () => {
		await refreshList();
		const { blobs, epoch } = await chain();
		const live = liveCertified(blobs, epoch).filter(
			(blob) => blob.endEpoch - epoch < 53,
		);
		const soonest = Math.min(...live.map((blob) => blob.endEpoch - epoch));
		const within = Math.min(10, Math.max(1, soonest));
		const { storage_price_per_unit_size } =
			await nodeClient().walrus.systemState();
		const price = BigInt(storage_price_per_unit_size);
		const due = live
			.filter((blob) => blob.endEpoch - epoch <= within)
			.sort(
				(a, b) =>
					a.endEpoch - b.endEpoch || a.objectId.localeCompare(b.objectId),
			);
		const first = due[0];
		if (!first) throw new Error("No live blob is close enough to expiry.");
		// A cap of one and a half renewals of the first due blob: exactly what fits is renewed.
		const cap = (extendCost(first.encodedSize, 1, price) * 3n) / 2n;
		const expected: ChainBlob[] = [];
		let total = 0n;
		for (const blob of due.slice(0, 50)) {
			const cost = extendCost(blob.encodedSize, 1, price);
			if (total + cost > cap) continue;
			total += cost;
			expected.push(blob);
		}
		expect(expected.length).toBeGreaterThan(0);
		expect(expected.length).toBeLessThan(due.length);

		const panel = await openInspector(page, first.objectId);
		const storage = panel.locator("#insp-storage");
		await storage.getByRole("button", { name: /^Auto-extend/ }).click();
		const toggle = storage.getByRole("switch", { name: "Auto-extend" });
		await toggle.check();
		// The cap starts at 0, so turning it on renews nothing until a cap is set.
		await expect(
			storage.getByText(/Raise the cap to renew|Nothing is due/),
		).toBeVisible();
		const spend = await spendTracker(owner, wal);
		const before = submitted;
		await storage
			.getByRole("textbox", { name: "Renew at" })
			.fill(String(within));
		await storage.getByRole("textbox", { name: "Renew at" }).press("Tab");
		const by = storage.getByRole("textbox", {
			name: "Epochs each renewal adds",
		});
		await by.fill("1");
		await by.press("Tab");
		expect(submitted).toBe(before);
		await storage
			.getByRole("textbox", { name: "WAL cap" })
			.fill(toDecimal(cap));
		await storage.getByRole("textbox", { name: "WAL cap" }).press("Tab");

		await expect(storage.getByText(/^Renewed \d+ blobs? for/)).toContainText(
			`Renewed ${expected.length === 1 ? "1 blob" : `${expected.length} blobs`}`,
			{ timeout: 120_000 },
		);
		await annotateTransaction(
			storage.getByText(/^Renewed \d+ blobs? for/),
			"auto-extend",
		);
		await toggle.uncheck();
		await expect
			.poll(
				async () => {
					const now = await ownedBlobs(NETWORK, owner);
					return due.map(
						(blob) =>
							(now.find((other) => other.objectId === blob.objectId)
								?.endEpoch ?? 0) - blob.endEpoch,
					);
				},
				{ timeout: 60_000 },
			)
			.toEqual(due.map((blob) => (expected.includes(blob) ? 1 : 0)));
		await expectWalSpent(spend, total);
		test.info().annotations.push({
			type: "fixture",
			description: `auto-extend renewed ${expected.map((blob) => blob.objectId).join(", ")} under a cap of ${cap} FROST; ${due.length} were due`,
		});
	});

	test("attaches a blob to a Morse publication in one transaction", async () => {
		const { blobs, epoch } = await chain();
		const target = liveCertified(blobs, epoch).find(
			(blob) => isPlain(blob) && blob.deletable && blob.attributes.name,
		);
		if (!target) throw new Error("The test wallet owns no blob to publish.");
		const panel = await openInspector(page, target.objectId);
		const section = panel.locator("#insp-publish");
		const picker = section.getByRole("combobox", {
			name: "Publication and collection",
		});
		await expect(picker).toBeVisible({ timeout: 90_000 });
		const option = picker
			.locator("option", { hasText: `Claude Testnet Run · ${COLLECTION}` })
			.first();
		await picker.selectOption((await option.getAttribute("value")) ?? "");
		await section
			.getByRole("textbox", { name: "Entry name" })
			.fill(`inspector ${RUN}`);
		const spend = await spendTracker(owner, wal);
		await section.getByRole("button", { name: "Add as entry · 1 tx" }).click();
		const done = section.getByText(/^Added as entry \d+ in Claude Testnet Run/);
		await expect(done).toBeVisible({ timeout: 90_000 });
		const entryId = Number(
			/entry (\d+)/.exec((await done.textContent()) ?? "")?.[1],
		);
		await annotateTransaction(done, "Morse attach");

		const config = morseConfig({ network: NETWORK });
		const reader = RpcPublicationReader.fromMorseConfig(config, nodeClient());
		const publicationId = await claudeRunPublication(reader, owner);
		const entry = await reader.getEntry(
			toPublicationId(publicationId),
			COLLECTION,
			entryId,
		);
		expect(entry.name).toBe(`inspector ${RUN}`);
		expect(entry.revisions.at(-1)?.blobRef).toEqual({
			kind: "blob",
			blobObjectId: target.objectId,
		});
		await expectSuiOnly(spend);
		test.info().annotations.push({
			type: "fixture",
			description: `entry ${entryId} in ${publicationId} · ${COLLECTION} for ${target.objectId}`,
		});
	});

	test("Delete is simulated against chain and never sent; expired blobs are blocked", async () => {
		const { blobs, epoch } = await chain();
		const deletable = liveCertified(blobs, epoch).find(
			(blob) => blob.deletable && isPlain(blob),
		);
		const expired = blobs.find((blob) => blob.endEpoch <= epoch);
		if (!deletable || !expired) throw new Error("Missing a delete fixture.");
		const before = submitted;

		const panel = await openInspector(page, deletable.objectId);
		await panel
			.getByRole("button", {
				name: "Delete blob · returns its storage to your wallet",
			})
			.click();
		await expect(
			panel.getByText(/^Simulated against chain: the delete goes through/),
		).toBeVisible({
			timeout: 60_000,
		});
		await expect(panel.getByText(/No WAL is refunded/)).toBeVisible();
		await expect(
			panel.getByRole("button", { name: "Delete for good · 1 tx" }),
		).toBeEnabled();
		// The second step is never pressed: this suite deletes nothing.
		await panel.getByRole("button", { name: "Keep it" }).click();

		// The same delete simulated from this process: it would succeed and remove the Blob object.
		const client = nodeClient();
		const transaction = client.walrus.deleteBlobTransaction({
			blobObjectId: deletable.objectId,
			owner,
		});
		transaction.setSender(owner);
		const simulated = await client.core.simulateTransaction({
			transaction,
			include: { effects: true },
		});
		expect(simulated.$kind).toBe("Transaction");
		if (simulated.$kind === "Transaction")
			expect(
				simulated.Transaction.effects.changedObjects.find(
					(change) => change.objectId === deletable.objectId,
				)?.idOperation,
			).toBe("Deleted");

		const expiredPanel = await openInspector(page, expired.objectId);
		await expect(
			expiredPanel.getByRole("button", { name: /^Delete (blob|quilt)/ }),
		).toBeDisabled();
		await expect(
			expiredPanel.getByText(
				`Its storage ended at epoch ${expired.endEpoch}, and an expired blob cannot be deleted.`,
			),
		).toBeVisible();

		expect(submitted).toBe(before);
		expect(
			(await ownedBlobs(NETWORK, owner)).some(
				(blob) => blob.objectId === deletable.objectId,
			),
		).toBe(true);
	});

	test("previews a tiny permanent image and blocks its delete and publish", async () => {
		const png = tinyPng(RUN);
		const spend = await spendTracker(owner, wal);
		const tray = await stageFiles(page, [
			{ name: "inspector-pixels.png", mimeType: "image/png", buffer: png },
		]);
		await openSetting(tray, "Keep for");
		await tray.getByRole("switch", { name: /^Deletable/ }).uncheck();
		const predicted = await predictedWal(tray, 1);
		await signAndSend(page, 2);
		const [item] = await waitForDone(page, ["inspector-pixels.png"]);
		const blob = await chainBlob(owner, item?.blobId);
		expect(blob.deletable).toBe(false);
		await expectWalSpent(spend, predicted);

		const panel = await openInspector(page, blob.objectId);
		const image = panel.locator(".thumb img");
		await expect(image).toBeVisible({ timeout: 90_000 });
		expect(
			await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
		).toBe(4);
		await expect(
			panel.getByRole("button", {
				name: "Delete blob · returns its storage to your wallet",
			}),
		).toBeDisabled();
		await expect(panel.getByText(/^This blob is permanent/)).toBeVisible();
		await expect(
			panel.getByText(/^Morse only takes deletable blobs/),
		).toBeVisible();
	});

	test("finishes a registered blob from the storage nodes' confirmations", async () => {
		const objectId = await registerWithoutCertify({
			keypair: funded as Keypair,
			bytes: new TextEncoder().encode(`Uploaded, never certified. ${RUN}\n`),
			name: "inspector-finish-nodes.txt",
			upload: true,
		});
		await refreshList();
		const panel = await openInspector(page, objectId);
		await expect(panel.getByText(/^Registered, not certified/)).toBeVisible();
		await panel.getByRole("button", { name: "Finish · 1 signature" }).click();
		await expect(panel.getByText(/^Certified\./)).toBeVisible({
			timeout: 120_000,
		});
		await annotateTransaction(
			panel.getByText(/^Certified\./),
			"Finish from nodes",
		);
		await expect
			.poll(
				async () =>
					(await ownedBlobs(NETWORK, owner)).find(
						(blob) => blob.objectId === objectId,
					)?.certifiedEpoch ?? null,
				{ timeout: 60_000 },
			)
			.not.toBeNull();
		test.info().annotations.push({
			type: "fixture",
			description: `finished from nodes: ${objectId}`,
		});
	});

	test("finishes a registered blob the nodes never got, from its original file", async () => {
		const text = `Registered only. ${RUN}\n`;
		const objectId = await registerWithoutCertify({
			keypair: funded as Keypair,
			bytes: new TextEncoder().encode(text),
			name: "inspector-finish-file.txt",
			upload: false,
		});
		await refreshList();
		const panel = await openInspector(page, objectId);
		await panel.getByRole("button", { name: "Finish · 1 signature" }).click();
		await expect(
			panel.getByText(
				/The storage nodes do not hold this blob\. Choose the original file/,
			),
		).toBeVisible({
			timeout: 120_000,
		});
		// A different file is refused before anything is signed.
		const before = submitted;
		await panel.locator('input[type="file"]').setInputFiles({
			name: "inspector-finish-file.txt",
			mimeType: "text/plain",
			buffer: Buffer.from(`${text}changed`),
		});
		await expect(
			panel.getByText(/Choose the exact file you uploaded/),
		).toBeVisible({
			timeout: 60_000,
		});
		expect(submitted).toBe(before);
		await panel.locator('input[type="file"]').setInputFiles({
			name: "inspector-finish-file.txt",
			mimeType: "text/plain",
			buffer: Buffer.from(text),
		});
		await expect(panel.getByText(/^Certified\./)).toBeVisible({
			timeout: 180_000,
		});
		await annotateTransaction(
			panel.getByText(/^Certified\./),
			"Finish from the file",
		);
		await expect
			.poll(
				async () =>
					(await ownedBlobs(NETWORK, owner)).find(
						(blob) => blob.objectId === objectId,
					)?.certifiedEpoch ?? null,
				{ timeout: 60_000 },
			)
			.not.toBeNull();
		test.info().annotations.push({
			type: "fixture",
			description: `finished from the file: ${objectId}`,
		});
	});
});

test.describe("inspector at 390", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the inspector tests.`);

	test("opens as a full-width sheet with no horizontal overflow", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		const keypair = funded as Keypair;
		await page.setViewportSize({ width: 390, height: 844 });
		await installTestWallet(page, [keypair]);
		await page.goto("/app#files");
		await connect(page, keypair.toSuiAddress());
		// The profile menu stays open after connecting and covers the list on a phone.
		await page.keyboard.press("Escape");
		await page
			.locator('table.tbl tbody tr[aria-level="1"]')
			.first()
			.locator("td.nm")
			.click({ timeout: 90_000 });
		const panel = inspector(page);
		await expect(panel).toBeVisible();
		await expect(panel.locator("#insp-storage")).toBeVisible({
			timeout: 60_000,
		});
		expect((await panel.boundingBox())?.width).toBe(390);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth === window.innerWidth,
			),
		).toBe(true);
		await panel.getByRole("button", { name: "Close details" }).click();
		await expect(panel).toBeHidden();
	});
});

/** A transaction that pays no WAL: only gas, recorded for the PR. */
async function expectSuiOnly(spend: Spend): Promise<void> {
	let suiSpent = 0n;
	// GraphQL indexes a little behind the full node the app reads.
	await expect
		.poll(
			async () => {
				suiSpent =
					spend.suiBefore -
					(await balance(NETWORK, spend.owner, SUI_COIN_TYPE));
				return suiSpent > 0n;
			},
			{ timeout: 30_000 },
		)
		.toBe(true);
	expect(await balance(NETWORK, spend.owner, spend.wal)).toBe(spend.walBefore);
	test.info().annotations.push({
		type: "spend",
		description: `WAL spent 0; SUI spent ${suiSpent} MIST`,
	});
}

/** The Claude Testnet Run publication, found through the wallet's PublisherCaps. */
async function claudeRunPublication(
	reader: RpcPublicationReader,
	owner: string,
): Promise<string> {
	const caps = await reader.listPublisherCapsOwnedBy(toSuiAddress(owner), {
		limit: 50,
	});
	for (const cap of caps.results) {
		const publication = await reader
			.getPublication(cap.publicationId)
			.catch((error: unknown) => {
				// Deleted publications keep their caps; skip those, report anything else.
				if (error instanceof NotFoundError) return null;
				throw error;
			});
		if (publication?.slug.startsWith(PUBLICATION_SLUG_PREFIX))
			return publication.id;
	}
	throw new Error("The Claude Testnet Run publication is gone.");
}
