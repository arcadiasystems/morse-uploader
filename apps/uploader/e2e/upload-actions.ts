import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	balance,
	type ChainBlob,
	ownedBlobs,
	SUI_COIN_TYPE,
	walrusEpoch,
} from "./chain";

/**
 * Upload sheet, queue and chain helpers shared by the Testnet specs that
 * write: the upload flow (phase 3) and the blob drawer (phase 4).
 */
const NETWORK = "testnet";

export interface DoneItem {
	blobId: string;
	recipientFile: string | null;
	entryId: number | undefined;
}

/**
 * Opens the sheet. With files, through the picker behind Upload; without,
 * it waits for the sheet a pick already opened (a folder set on the
 * folder picker goes straight to the sheet).
 */
export async function openSheet(
	page: Page,
	files?: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<Locator> {
	if (files) {
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "Upload", exact: true }).click();
		await (await chooser).setFiles(files);
	}
	const sheet = page.getByRole("dialog", {
		name: /Upload \d+ items? to Walrus/,
	});
	await expect(sheet).toBeVisible();
	return sheet;
}

/**
 * Opens the transfers slide-over, unless it is open, from the rail's
 * Transfers item: phones hide the top bar's pill while nothing is in flight.
 */
export async function openTransfers(page: Page): Promise<Locator> {
	const panel = page.getByRole("dialog", { name: "Transfers" });
	if (!(await panel.isVisible()))
		await page
			.getByRole("navigation", { name: "Views" })
			.getByRole("button", { name: /^Transfers/ })
			.click();
	await expect(panel).toBeVisible();
	return panel;
}

/** Sets the period to `epochs` and reads the WAL the sheet predicts, in FROST. */
export async function predictedWal(
	sheet: Locator,
	epochs: number,
): Promise<bigint> {
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

export function toFrost(text: string): bigint {
	const match = /(\d+)(?:\.(\d+))?/.exec(text.replaceAll(",", ""));
	if (!match) throw new Error(`No amount in "${text}".`);
	return (
		BigInt(match[1] ?? "0") * 1_000_000_000n +
		BigInt((match[2] ?? "").padEnd(9, "0"))
	);
}

export async function confirm(
	sheet: Locator,
	signatures: number,
): Promise<void> {
	const upload = sheet.getByRole("button", {
		name: `Upload · sign ${signatures} times`,
	});
	await expect(upload).toBeEnabled({ timeout: 60_000 });
	await upload.click();
	await expect(sheet).toBeHidden();
}

export function queueRow(page: Page, name: string): Locator {
	return page
		.locator("tr.q", { has: page.locator(".label", { hasText: name }) })
		.last();
}

/** Waits until each named item is done, from the Done tab, and reads what it shows. */
export async function waitForDone(
	page: Page,
	names: readonly string[],
): Promise<DoneItem[]> {
	const panel = await openTransfers(page);
	await panel.getByRole("tab", { name: /Done/ }).click();
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

export async function chainBlob(
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

export async function aggregatorBytes(blobId: string): Promise<Uint8Array> {
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

export interface Spend {
	owner: string;
	wal: string;
	walBefore: bigint;
	suiBefore: bigint;
	epoch: number;
}

export async function spendTracker(owner: string, wal: string): Promise<Spend> {
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
export async function expectWalSpent(
	spend: Spend,
	predicted: bigint,
): Promise<void> {
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

export async function overflow(page: Page): Promise<{ fits: boolean }> {
	return page.evaluate(() => ({
		fits: document.documentElement.scrollWidth === window.innerWidth,
	}));
}
