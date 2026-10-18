import type { Keypair } from "@mysten/sui/cryptography";
import { expect, type Page, test } from "@playwright/test";
import { connect } from "./app-actions";
import { type ChainBlob, ownedBlobs, walrusEpoch } from "./chain";
import {
	publishedObjectIds,
	sharedObjectIds,
	walletPublications,
} from "./morse-chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

const funded = keypairFromEnv();
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Clock = Awaited<ReturnType<typeof walrusEpoch>>;

/** The count a filter chip shows, or `null` when it shows none. */
async function chipCount(page: Page, label: string): Promise<number | null> {
	const chip = page
		.getByRole("navigation", { name: "Filters" })
		.getByRole("link", { name: new RegExp(`^${label}`) });
	const count = chip.locator(".n");
	return (await count.count()) === 0 ? null : Number(await count.textContent());
}

/**
 * Every top-level row's object id in the list, scrolling the view from top
 * to bottom: only the rows on screen are rendered.
 */
async function listedObjectIds(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const view = document.querySelector<HTMLElement>(
			'section[aria-label="Files"]',
		);
		if (!view) throw new Error("The Files view is not on screen.");
		const frame = () =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
		const ids = new Set<string>();
		view.scrollTop = 0;
		await frame();
		for (;;) {
			for (const row of view.querySelectorAll<HTMLElement>(
				'tbody tr[aria-level="1"]',
			))
				ids.add(row.dataset.key ?? "");
			if (view.scrollTop + view.clientHeight >= view.scrollHeight) break;
			view.scrollTop += Math.floor(view.clientHeight * 0.8);
			await frame();
		}
		view.scrollTop = 0;
		return [...ids];
	});
}

/** Ms until a blob's storage ends, from the live epoch clock. */
function msLeft(blob: ChainBlob, clock: Clock): number {
	return (
		clock.epochStartMs +
		(blob.endEpoch - clock.epoch) * clock.epochDurationMs -
		Date.now()
	);
}

test.describe("Files filter counts, checked against chain", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the wallet tests.`);

	let key: Keypair;
	let address: string;
	let chain: ChainBlob[];

	test.beforeEach(async ({ page }) => {
		if (!funded) return;
		key = funded;
		address = key.toSuiAddress();
		chain = await ownedBlobs("testnet", address);
		await installTestWallet(page, [key]);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app#files");
		await connect(page, address);
		await page.keyboard.press("Escape");
		await expect
			.poll(() => chipCount(page, "All"), { timeout: 60_000 })
			.toBe(chain.length);
	});

	test("All, Quilts, Encrypted and Expiring count what chain holds", async ({
		page,
	}) => {
		const clock = await walrusEpoch("testnet");
		const live = chain.filter(
			(blob) => blob.certifiedEpoch !== null && blob.endEpoch > clock.epoch,
		);
		const thirtyDays = 30 * DAY_MS;
		// Within an hour of the 30-day line the test and the app, reading the
		// clock seconds apart, could place a blob on either side.
		const sure = live.filter(
			(blob) => msLeft(blob, clock) < thirtyDays - HOUR_MS,
		);
		const maybe = live.filter(
			(blob) => Math.abs(msLeft(blob, clock) - thirtyDays) <= HOUR_MS,
		);
		expect(await chipCount(page, "All")).toBe(chain.length);
		expect(await chipCount(page, "Quilts")).toBe(
			chain.filter((blob) => blob.attributes._walrusBlobType === "quilt")
				.length,
		);
		expect(await chipCount(page, "Encrypted")).toBe(
			chain.filter((blob) => blob.attributes.seal !== undefined).length,
		);
		const expiring = await chipCount(page, "Expiring");
		expect(expiring).not.toBeNull();
		expect(expiring).toBeGreaterThanOrEqual(sure.length);
		expect(expiring).toBeLessThanOrEqual(sure.length + maybe.length);
	});

	test("Published lists the blobs a public Morse entry points at", async ({
		page,
	}) => {
		const publications = await walletPublications("testnet", address);
		const expected = publishedObjectIds(
			chain,
			publications.flatMap((publication) => publication.publicRefs),
		);
		await expect
			.poll(() => chipCount(page, "Published"), { timeout: 60_000 })
			.toBe(expected.size);
		await page
			.getByRole("navigation", { name: "Filters" })
			.getByRole("link", { name: /^Published/ })
			.click();
		await expect(page).toHaveURL(/#files\/published$/);
		await expect(
			page.locator('tbody tr[aria-level="1"]').first(),
		).toBeVisible();
		expect((await listedObjectIds(page)).sort()).toEqual([...expected].sort());
	});

	test("Shared lists the blobs whose RecipientFile has another member", async ({
		page,
	}) => {
		const expected = await sharedObjectIds("testnet", address, chain);
		await expect
			.poll(() => chipCount(page, "Shared"), { timeout: 60_000 })
			.toBe(expected.size);
		await page
			.getByRole("navigation", { name: "Filters" })
			.getByRole("link", { name: /^Shared/ })
			.click();
		await expect(page).toHaveURL(/#files\/shared$/);
		if (expected.size === 0) {
			await expect(page.getByText("Nothing shared")).toBeVisible();
			return;
		}
		await expect(
			page.locator('tbody tr[aria-level="1"]').first(),
		).toBeVisible();
		expect((await listedObjectIds(page)).sort()).toEqual([...expected].sort());
	});
});
