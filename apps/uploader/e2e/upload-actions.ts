import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	balance,
	type ChainBlob,
	ownedBlobs,
	SUI_COIN_TYPE,
	walrusEpoch,
} from "./chain";

/**
 * Staging tray, transfers and chain helpers shared by the Testnet specs
 * that write: uploads (phase 3, now through the tray), the transfers
 * slide-over (R3) and the inspector (R2).
 */
const NETWORK = "testnet";

/** A file to stage, as Playwright's file chooser takes it. */
export interface StageFile {
	name: string;
	mimeType: string;
	buffer: Buffer;
}

export interface DoneItem {
	blobId: string;
	recipientFile: string | null;
	entryId: number | undefined;
}

/** The staging tray, once something is staged. */
export function stagingTray(page: Page): Locator {
	return page.getByRole("region", { name: "Staged for upload" });
}

/** Stages files through the picker behind the top bar's Upload button. */
export async function stageFiles(
	page: Page,
	files: readonly StageFile[],
): Promise<Locator> {
	const chooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Upload", exact: true }).click();
	await (await chooser).setFiles([...files]);
	return pricedTray(page);
}

/** Stages a folder from disk through the folder picker, as the Overview's Choose folder does. */
export async function stageFolder(
	page: Page,
	folder: string,
): Promise<Locator> {
	await page.locator('input[data-picker="folder"]').setInputFiles(folder);
	return pricedTray(page);
}

/** The tray once its prices and Seal settings are read, so its settings show what they are. */
async function pricedTray(page: Page): Promise<Locator> {
	const tray = stagingTray(page);
	await expect(
		tray.getByRole("button", { name: /^Sign and send · \d+ signatures?$/ }),
	).toBeVisible({ timeout: 60_000 });
	return tray;
}

/** A staged item's row in the tray, by the name it shows ("site/" for a folder). */
export function trayItem(tray: Locator, label: string): Locator {
	return tray.locator("li[data-staged]").filter({
		has: tray.page().locator(".name", { hasText: label }),
	});
}

/** Opens one of the tray's four settings, unless it is open. */
export async function openSetting(
	tray: Locator,
	label: "Keep for" | "Encryption" | "Folders" | "Also publish",
): Promise<void> {
	const tile = tray.locator("button.set").filter({ hasText: label });
	if ((await tile.getAttribute("aria-expanded")) !== "true") await tile.click();
	await expect(tile).toHaveAttribute("aria-expanded", "true");
}

/** Sets Keep for to `epochs` and reads the WAL the tray predicts, in FROST. */
export async function predictedWal(
	tray: Locator,
	epochs: number,
): Promise<bigint> {
	await openSetting(tray, "Keep for");
	await tray.getByRole("spinbutton").fill(String(epochs));
	await expect(tray.getByText(`Storage, ${epochs} epoch`)).toBeVisible();
	await expect(tray.locator(".cost dd", { hasText: "≈" })).toBeVisible({
		timeout: 60_000,
	});
	const amount = async (label: RegExp) =>
		toFrost(
			await tray
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

/**
 * Presses Sign and send once it shows `signatures`. The prices are read
 * again first; once the batch is queued the tray empties and the
 * transfers slide-over opens.
 */
export async function signAndSend(
	page: Page,
	signatures: number,
): Promise<void> {
	const tray = stagingTray(page);
	const send = tray.getByRole("button", {
		name: `Sign and send · ${signatures} ${signatures === 1 ? "signature" : "signatures"}`,
	});
	await expect(send).toBeEnabled({ timeout: 60_000 });
	await send.click();
	await expect(tray).toBeHidden({ timeout: 30_000 });
	await expect(page.getByRole("dialog", { name: "Transfers" })).toBeVisible();
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

/** A transfer's row in the slide-over, by its name attribute (a path, or a folder's name). */
export function transferRow(page: Page, name: string): Locator {
	return page.locator(`li.tx[data-name="${name}"]`).last();
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
		const row = transferRow(page, name);
		await expect(row).toHaveClass(/\bdone\b/, { timeout: 240_000 });
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
 * The WAL the uploads spent equals what the tray predicted. The tolerance
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

/**
 * Counts the transactions the page submits, so a test can tell that
 * nothing was signed and sent while it waited. Requests go on unchanged.
 */
export async function countSubmissions(page: Page): Promise<() => number> {
	let count = 0;
	await page.route(
		"**/sui.rpc.v2.TransactionExecutionService/ExecuteTransaction",
		(route) => {
			count += 1;
			return route.continue();
		},
	);
	return () => count;
}

/** A screenshot kept with the test's output, for the visual review. */
export async function keepShot(page: Page, name: string): Promise<void> {
	await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}
