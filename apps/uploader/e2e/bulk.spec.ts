import type { Keypair } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { connect } from "./app-actions";
import { type ChainBlob, ownedBlobs, walCoinType, walrusEpoch } from "./chain";
import {
	AGGREGATOR,
	annotateTransaction,
	extendCost,
	filterBox,
	isPlain,
	liveCertified,
	nodeClient,
	toDecimal,
} from "./inspector-actions";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";
import { expectWalSpent, spendTracker, toFrost } from "./upload-actions";

/**
 * The bulk bar against Testnet with the funded test wallet. Real writes are
 * two: one Extend all of 2 blobs by 1 epoch, and one Extend everything
 * expiring held to 2 blobs by its cap. Delete is only ever simulated: no
 * test presses the button that signs it, and the page's transactions are
 * counted to prove it. Fixtures come from chain when each test runs.
 */
const funded = keypairFromEnv();
const NETWORK = "testnet";
const DAY_MS = 86_400_000;
/** The flat quilts that outlive epoch 555 (2026-10-18), extended first so the quilt fixtures stay live. */
const SURVIVING_QUILTS = [
	"0x122788423f0321f82d3810af88aa99da99cfa513c5a511d49912a48e40ad0209",
	"0xcfcc8cf5b3716c3b9d3707f9447fcbbf5127a85dc460805d9f074bcbfc802d10",
];

test.describe("bulk bar on Testnet", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the bulk tests.`);
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

	async function chain() {
		const [blobs, clock] = await Promise.all([
			ownedBlobs(NETWORK, owner),
			walrusEpoch(NETWORK),
		]);
		return { blobs, ...clock };
	}

	async function storagePrice(): Promise<bigint> {
		const state = await nodeClient().walrus.systemState();
		return BigInt(state.storage_price_per_unit_size);
	}

	function bar(): Locator {
		return page.getByRole("toolbar", { name: "Selected blobs" });
	}

	/** Selects blobs by filtering to each one and checking its row: the selection survives the filter. */
	async function select(objectIds: readonly string[]): Promise<void> {
		await page.evaluate(() => {
			window.location.hash = "#files";
		});
		for (const objectId of objectIds) {
			await filterBox(page).fill(objectId);
			await page
				.locator(`table.tbl tr[data-key="${objectId}"]`)
				.getByRole("checkbox")
				.check();
		}
		await filterBox(page).fill("");
		await expect(bar()).toContainText(`${objectIds.length} selected`);
	}

	async function clearSelection(): Promise<void> {
		if (await bar().isVisible())
			await bar().getByRole("button", { name: "Clear the selection" }).click();
		await expect(bar()).toBeHidden();
	}

	/** A cost row's amount in the open sheet, as raw units. */
	async function costOf(sheet: Locator, label: RegExp): Promise<bigint> {
		const dd = sheet
			.locator(".cost dt", { hasText: label })
			.locator("xpath=following-sibling::dd");
		let shown = "";
		await expect
			.poll(async () => {
				shown = await dd.evaluate(
					(node) => (node.querySelector(".sr-only") ?? node).textContent ?? "",
				);
				return /\d/.test(shown);
			})
			.toBe(true);
		return toFrost(shown);
	}

	async function costRow(sheet: Locator, label: string): Promise<string> {
		return (
			(await sheet
				.locator(".cost dt", { hasText: label })
				.locator("xpath=following-sibling::dd")
				.textContent()) ?? ""
		).trim();
	}

	test("keeps the selection across filter changes and says what the view hides", async () => {
		const { blobs, epoch } = await chain();
		const live = liveCertified(blobs, epoch);
		const quilt = live.find(
			(blob) => blob.attributes._walrusBlobType === "quilt",
		);
		const plain = live.find(isPlain);
		if (!quilt || !plain) throw new Error("Missing a quilt or a plain blob.");
		await select([quilt.objectId, plain.objectId]);
		await page.evaluate(() => {
			window.location.hash = "#files/quilts";
		});
		await expect(bar()).toContainText("2 selected · 1 not in this view");
		await page.evaluate(() => {
			window.location.hash = "#files";
		});
		await expect(bar()).toContainText("2 selected");
		await expect(bar()).not.toContainText("not in this view");
		await clearSelection();
	});

	test("extends 2 selected blobs by 1 epoch in one signature, and chain shows both", async () => {
		const { blobs, epoch } = await chain();
		const extendable = liveCertified(blobs, epoch).filter(
			(blob) => blob.endEpoch - epoch < 53,
		);
		const targets = [
			...extendable.filter((blob) => SURVIVING_QUILTS.includes(blob.objectId)),
			...extendable
				.filter((blob) => !SURVIVING_QUILTS.includes(blob.objectId))
				.sort((a, b) => a.endEpoch - b.endEpoch),
		].slice(0, 2);
		if (targets.length < 2) throw new Error("Fewer than 2 blobs to extend.");
		test.info().annotations.push({
			type: "fixture",
			description: `extend all: ${targets.map((blob) => `${blob.objectId} from ${blob.endEpoch}`).join(", ")}`,
		});
		await select(targets.map((blob) => blob.objectId));
		await bar()
			.getByRole("button", { name: /^Extend all/ })
			.click();
		const sheet = page.getByRole("dialog", {
			name: "Extend 2 selected blobs",
		});
		await expect(sheet).toBeVisible();
		const price = await storagePrice();
		const expected = targets.reduce(
			(sum, blob) => sum + extendCost(blob.encodedSize, 1, price),
			0n,
		);
		const predicted = await costOf(sheet, /^Storage, 1 epoch each/);
		expect(predicted).toBe(expected);
		expect(await costRow(sheet, "Signatures")).toBe("1");
		expect(await costRow(sheet, "Blobs extended")).toBe("2");

		const spend = await spendTracker(owner, wal);
		const before = submitted;
		const sign = sheet.getByRole("button", {
			name: "Extend 2 blobs · sign once",
		});
		await expect(sign).toBeEnabled({ timeout: 60_000 });
		await sign.click();
		const done = sheet.getByText(/^Extended 2 blobs\./);
		await expect(done).toBeVisible({ timeout: 120_000 });
		expect(submitted - before).toBe(1);
		await annotateTransaction(done, "extend all");
		await expect
			.poll(
				async () => {
					const now = await ownedBlobs(NETWORK, owner);
					return targets.map(
						(blob) =>
							now.find((other) => other.objectId === blob.objectId)?.endEpoch,
					);
				},
				{ timeout: 60_000 },
			)
			.toEqual(targets.map((blob) => blob.endEpoch + 1));
		await expectWalSpent(spend, predicted);
		await sheet.getByRole("button", { name: "Close" }).click();
		await clearSelection();
	});

	test("verifies each selected blob against storage nodes", async () => {
		const { blobs, epoch } = await chain();
		const targets = liveCertified(blobs, epoch)
			.filter((blob) => isPlain(blob) && blob.size < 1_000n)
			.slice(0, 2);
		if (targets.length < 2) throw new Error("Fewer than 2 small live blobs.");
		await select(targets.map((blob) => blob.objectId));
		const before = submitted;
		await bar().getByRole("button", { name: "Verify" }).click();
		const sheet = page.getByRole("dialog", { name: "Verify the selection" });
		await sheet.getByRole("button", { name: "Verify 2 blobs" }).click();
		await expect(
			sheet.getByText("Bytes match the blob id for 2 of 2 blobs."),
		).toBeVisible({ timeout: 180_000 });
		await expect(sheet.locator(".checks .ok")).toHaveCount(2);
		await expect(sheet).not.toContainText(/\d+ storage nodes/);
		expect(submitted).toBe(before);
		await sheet.getByRole("button", { name: "Close" }).click();
		await clearSelection();
	});

	test("shares aggregator links for the selection that all resolve, leaving out an expired blob", async () => {
		const { blobs, epoch } = await chain();
		const live = liveCertified(blobs, epoch);
		const plain = live.find((blob) => isPlain(blob) && blob.size < 1_000n);
		const quilt = live.find(
			(blob) => blob.attributes._walrusBlobType === "quilt",
		);
		const expired = blobs.find((blob) => blob.endEpoch <= epoch);
		if (!plain || !quilt || !expired)
			throw new Error("Missing a share fixture.");
		const patches = (await (
			await fetch(`${AGGREGATOR}/v1/quilts/${quilt.blobId}/patches`)
		).json()) as { patch_id: string }[];
		await select([plain.objectId, quilt.objectId, expired.objectId]);
		await bar().getByRole("button", { name: "Share" }).click();
		const sheet = page.getByRole("dialog", { name: "Share the selection" });
		const all = sheet.getByRole("textbox", { name: /^All \d+ links?$/ });
		await expect(all).toBeVisible({ timeout: 60_000 });
		const links = (await all.inputValue()).split("\n");
		expect(links).toHaveLength(1 + patches.length);
		expect(links).toContain(`${AGGREGATOR}/v1/blobs/${plain.blobId}`);
		for (const patch of patches)
			expect(links).toContain(
				`${AGGREGATOR}/v1/blobs/by-quilt-patch-id/${patch.patch_id}`,
			);
		await expect(sheet.getByText(/1 storage ended/)).toBeVisible();
		for (const link of links) {
			const response = await fetch(link);
			expect(response.status, link).toBe(200);
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (link.endsWith(plain.blobId)) {
				// The link's bytes encode to the blob's own id, recomputed here.
				const { blobId } = await nodeClient().walrus.computeBlobMetadata({
					bytes,
				});
				expect(blobId).toBe(plain.blobId);
			}
		}
		await sheet.getByRole("button", { name: "Close" }).click();
		await clearSelection();
	});

	test("Delete is simulated against chain and never sent; ineligible blobs are left out with why", async () => {
		const { blobs, epoch } = await chain();
		const live = liveCertified(blobs, epoch);
		const deletable = live
			.filter((blob) => blob.deletable && isPlain(blob))
			.slice(0, 2);
		const permanent = live.find((blob) => !blob.deletable);
		const expired = blobs.find((blob) => blob.endEpoch <= epoch);
		if (deletable.length < 2 || !permanent || !expired)
			throw new Error("Missing a delete fixture.");
		const before = submitted;
		await select([
			...deletable.map((blob) => blob.objectId),
			permanent.objectId,
			expired.objectId,
		]);
		await bar().getByRole("button", { name: "Delete" }).click();
		const sheet = page.getByRole("dialog", { name: "Delete the selection" });
		await expect(sheet.getByText(/1 permanent, not deletable/)).toBeVisible();
		await expect(sheet.getByText(/1 storage ended/)).toBeVisible();
		await expect(sheet.getByText(/No WAL is refunded/)).toBeVisible();
		expect(await costRow(sheet, "Blobs deleted")).toBe("2");
		await sheet
			.getByRole("button", {
				name: "Delete 2 blobs · returns their storage to your wallet",
			})
			.click();
		await expect(
			sheet.getByText(/^Simulated against chain: the delete goes through/),
		).toBeVisible({ timeout: 60_000 });
		await expect(
			sheet.getByRole("button", { name: "Delete for good · 1 tx" }),
		).toBeEnabled();
		// The second step is never pressed: this suite deletes nothing.
		await sheet.getByRole("button", { name: "Keep them" }).click();
		await sheet.getByRole("button", { name: "Cancel" }).click();

		// The same deletes, simulated from this process: both Blob objects would go.
		const client = nodeClient();
		const transaction = new Transaction();
		for (const blob of deletable)
			client.walrus.deleteBlobTransaction({
				blobObjectId: blob.objectId,
				owner,
				transaction,
			});
		transaction.setSender(owner);
		const simulated = await client.core.simulateTransaction({
			transaction,
			include: { effects: true },
		});
		expect(simulated.$kind).toBe("Transaction");
		if (simulated.$kind === "Transaction")
			for (const blob of deletable)
				expect(
					simulated.Transaction.effects.changedObjects.find(
						(change) => change.objectId === blob.objectId,
					)?.idOperation,
				).toBe("Deleted");

		expect(submitted).toBe(before);
		const still = await ownedBlobs(NETWORK, owner);
		for (const blob of deletable)
			expect(still.some((other) => other.objectId === blob.objectId)).toBe(
				true,
			);
		await clearSelection();
	});

	test("Extend everything expiring previews the cost, and its cap holds the spend to 2 blobs", async () => {
		const { blobs, epoch, epochStartMs, epochDurationMs } = await chain();
		const now = Date.now();
		// Expiring as the app counts it: certified, live, under 30 days left.
		const expiring = blobs
			.filter(
				(blob) =>
					blob.certifiedEpoch !== null &&
					blob.endEpoch > epoch &&
					epochStartMs + (blob.endEpoch - epoch) * epochDurationMs - now <
						30 * DAY_MS &&
					blob.endEpoch - epoch < 53,
			)
			.sort(
				(a, b) =>
					a.endEpoch - b.endEpoch || a.objectId.localeCompare(b.objectId),
			);
		if (expiring.length < 3) throw new Error("Fewer than 3 expiring blobs.");
		const price = await storagePrice();
		const cost = (blob: ChainBlob) => extendCost(blob.encodedSize, 1, price);
		const total = expiring.reduce((sum, blob) => sum + cost(blob), 0n);

		await page.evaluate(() => {
			window.location.hash = "#files/expiring";
		});
		await page
			.getByRole("button", { name: "Extend everything expiring" })
			.click();
		const sheet = page.getByRole("dialog", {
			name: "Extend everything expiring",
		});
		await expect(sheet).toBeVisible();
		expect(await costOf(sheet, /^Storage, 1 epoch each/)).toBe(total);
		expect(await costRow(sheet, "Blobs extended")).toBe(
			String(expiring.length),
		);
		expect(await costRow(sheet, "Signatures")).toBe(
			String(Math.ceil(expiring.length / 50)),
		);

		// A cap of the two soonest extends: exactly those fit, the rest wait.
		const [first, second, third] = expiring;
		if (!first || !second || !third) throw new Error("Unreachable.");
		const cap = cost(first) + cost(second);
		await sheet
			.getByRole("textbox", { name: "Spend at most" })
			.fill(toDecimal(cap));
		await expect.poll(() => costRow(sheet, "Blobs extended")).toBe("2");
		const predicted = await costOf(sheet, /^Storage, 1 epoch each/);
		expect(predicted).toBe(cap);
		expect(await costRow(sheet, "Signatures")).toBe("1");
		await expect(
			sheet.getByText(
				new RegExp(`^${expiring.length - 2} blobs do not fit in the cap`),
			),
		).toBeVisible();

		const spend = await spendTracker(owner, wal);
		const before = submitted;
		const sign = sheet.getByRole("button", {
			name: "Extend 2 blobs · sign once",
		});
		await expect(sign).toBeEnabled({ timeout: 60_000 });
		await sign.click();
		const done = sheet.getByText(/^Extended 2 blobs\./);
		await expect(done).toBeVisible({ timeout: 120_000 });
		expect(submitted - before).toBe(1);
		await annotateTransaction(done, "extend everything expiring, capped");
		await expect
			.poll(
				async () => {
					const now = await ownedBlobs(NETWORK, owner);
					return [first, second, third].map(
						(blob) =>
							(now.find((other) => other.objectId === blob.objectId)
								?.endEpoch ?? 0) - blob.endEpoch,
					);
				},
				{ timeout: 60_000 },
			)
			.toEqual([1, 1, 0]);
		await expectWalSpent(spend, predicted);
		expect(predicted).toBeLessThanOrEqual(cap);
		test.info().annotations.push({
			type: "fixture",
			description: `extend everything expiring: ${expiring.length} expiring, cap ${cap} FROST, extended ${first.objectId} and ${second.objectId}`,
		});
		await sheet.getByRole("button", { name: "Close" }).click();
	});
});
