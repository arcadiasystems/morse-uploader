import type { Keypair } from "@mysten/sui/cryptography";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { connect } from "./app-actions";
import { type ChainBlob, ownedBlobs, walrusEpoch } from "./chain";
import {
	publishedObjectIds,
	sentDigests,
	walletPublications,
} from "./morse-chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

const funded = keypairFromEnv();
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MONTHS = 12;

type Clock = Awaited<ReturnType<typeof walrusEpoch>>;
type Category = "unfinished" | "soon" | "later";

function overview(page: Page): Locator {
	return page.locator('section[aria-label="Overview"]');
}

/** Connects the test wallet and waits for the Overview's chain reads. */
async function connectAndRead(page: Page, address: string): Promise<void> {
	await connect(page, address);
	await page.keyboard.press("Escape");
	await expect(overview(page).locator("[data-stored-bytes]")).toBeVisible({
		timeout: 60_000,
	});
}

/** When a blob's storage ends: the start of its end epoch, from the live epoch clock. */
function endsAt(blob: ChainBlob, clock: Clock): number {
	return (
		clock.epochStartMs + (blob.endEpoch - clock.epoch) * clock.epochDurationMs
	);
}

/** Stored, as the app counts it: certified, and the end epoch not reached. */
function isStored(blob: ChainBlob, clock: Clock): boolean {
	return blob.certifiedEpoch !== null && blob.endEpoch > clock.epoch;
}

/** The local calendar month a moment falls in, counted from the current month. */
function monthIndex(ms: number, nowMs: number): number {
	const now = new Date(nowMs);
	const at = new Date(ms);
	return Math.max(
		0,
		(at.getFullYear() - now.getFullYear()) * 12 +
			at.getMonth() -
			now.getMonth(),
	);
}

/** `YYYY-MM` for the month `index` months after the current one, as the bars name them. */
function monthKey(index: number, nowMs: number): string {
	const now = new Date(nowMs);
	const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Whether a moment lies within an hour of a local month boundary. */
function nearMonthBoundary(ms: number): boolean {
	const at = new Date(ms);
	const start = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
	const next = new Date(at.getFullYear(), at.getMonth() + 1, 1).getTime();
	return ms - start < HOUR_MS || next - ms < HOUR_MS;
}

interface Range {
	min: number;
	max: number;
}

/**
 * The timeline each bar should show, as a range per counter. A blob within
 * an hour of a month boundary, or of the 30-day line between "ends within
 * 30 days" and "later", could land on either side: the app and the test
 * read the clock seconds apart, and epoch start times are estimates. Such a
 * blob widens the range of every month and category it could fall in
 * instead of failing the run.
 */
function expectedTimeline(
	blobs: readonly ChainBlob[],
	clock: Clock,
	nowMs: number,
): Record<"total" | Category, Range>[] {
	const months = Array.from({ length: MONTHS }, () => ({
		total: { min: 0, max: 0 },
		unfinished: { min: 0, max: 0 },
		soon: { min: 0, max: 0 },
		later: { min: 0, max: 0 },
	}));
	for (const blob of blobs) {
		if (blob.endEpoch <= clock.epoch) continue;
		const ends = endsAt(blob, clock);
		const left = ends - nowMs;
		const categories: Category[] =
			blob.certifiedEpoch === null
				? ["unfinished"]
				: Math.abs(left - 30 * DAY_MS) < HOUR_MS
					? ["soon", "later"]
					: left < 30 * DAY_MS
						? ["soon"]
						: ["later"];
		const indexes = nearMonthBoundary(ends)
			? [monthIndex(ends - HOUR_MS, nowMs), monthIndex(ends + HOUR_MS, nowMs)]
			: [monthIndex(ends, nowMs)];
		const certain = indexes.length === 1 && categories.length === 1;
		for (const index of new Set(indexes)) {
			const month = months[index];
			if (!month) continue;
			month.total.max += 1;
			if (certain) month.total.min += 1;
			for (const category of categories) {
				month[category].max += 1;
				if (certain) month[category].min += 1;
			}
		}
	}
	return months;
}

test.describe("Overview, read from chain", () => {
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
		await page.goto("/app#overview");
		await connectAndRead(page, address);
	});

	test("stored size, counts and the first end epoch match chain", async ({
		page,
	}) => {
		const clock = await walrusEpoch("testnet");
		const stored = chain.filter((blob) => isStored(blob, clock));
		expect(stored.length).toBeGreaterThan(0);
		const bytes = stored.reduce((sum, blob) => sum + blob.size, 0n);
		const firstEnd = Math.min(...stored.map((blob) => blob.endEpoch));
		test.info().annotations.push({
			type: "chain",
			description: `${stored.length} stored blobs, ${bytes} bytes, first end epoch ${firstEnd}`,
		});

		const card = overview(page).locator("[data-stored-bytes]");
		await expect(card).toHaveAttribute("data-stored-bytes", bytes.toString());
		await expect(card).toHaveAttribute(
			"data-stored-blobs",
			String(stored.length),
		);
		const quilts = stored.filter(
			(blob) => blob.attributes._walrusBlobType === "quilt",
		).length;
		const encrypted = stored.filter(
			(blob) => (blob.attributes.seal ?? "").trim() !== "",
		).length;
		await expect(card).toContainText(
			`${stored.length} ${stored.length === 1 ? "blob" : "blobs"} · ${quilts} ${quilts === 1 ? "quilt" : "quilts"} · ${encrypted} encrypted`,
		);
		await expect(
			overview(page).locator("[data-first-end-epoch]"),
		).toHaveAttribute("data-first-end-epoch", String(firstEnd));
		await expect(
			overview(page).locator("[data-first-end-epoch]"),
		).toContainText(`paid until epoch ${firstEnd} starts`);
	});

	test("the 12-month expiry timeline matches buckets computed from chain", async ({
		page,
	}) => {
		const clock = await walrusEpoch("testnet");
		const bars = overview(page).locator("li[data-month]");
		await expect(bars).toHaveCount(MONTHS);
		const nowMs = Date.now();
		const expected = expectedTimeline(chain, clock, nowMs);
		const shown = await bars.evaluateAll((items) =>
			items.map((item) => ({
				month: item.getAttribute("data-month") ?? "",
				total: Number(item.getAttribute("data-total")),
				unfinished: Number(item.getAttribute("data-unfinished")),
				soon: Number(item.getAttribute("data-soon")),
				later: Number(item.getAttribute("data-later")),
			})),
		);
		expect(shown.map((bar) => bar.month)).toEqual(
			Array.from({ length: MONTHS }, (_, index) => monthKey(index, nowMs)),
		);
		shown.forEach((bar, index) => {
			const want = expected[index];
			if (!want) throw new Error(`No expected bucket for month ${index}.`);
			for (const field of ["total", "unfinished", "soon", "later"] as const) {
				expect(bar[field], `${bar.month} ${field}`).toBeGreaterThanOrEqual(
					want[field].min,
				);
				expect(bar[field], `${bar.month} ${field}`).toBeLessThanOrEqual(
					want[field].max,
				);
			}
		});
	});

	test("Published through Morse lists the wallet's publications with their public entries", async ({
		page,
	}) => {
		const publications = await walletPublications("testnet", address);
		test.skip(
			publications.length === 0,
			"The test wallet owns or writes to no Morse publication.",
		);
		const rows = overview(page).locator("li[data-publication]");
		await expect(rows.first()).toBeVisible({ timeout: 60_000 });
		const shown = publications.slice(0, 4);
		await expect(rows).toHaveCount(shown.length);
		const all = publishedObjectIds(
			chain,
			publications.flatMap((publication) => publication.publicRefs),
		);
		test.info().annotations.push({
			type: "chain",
			description: `${publications.length} publications, ${all.size} of the wallet's blob objects published`,
		});
		for (const [index, publication] of shown.entries()) {
			const row = rows.nth(index);
			const mine = publishedObjectIds(chain, publication.publicRefs).size;
			const entries = publication.publicRefs.length;
			await expect(row).toHaveAttribute("data-publication", publication.id);
			await expect(row).toContainText(publication.name);
			await expect(row).toContainText(
				`${entries} ${entries === 1 ? "public entry" : "public entries"}`,
			);
			await expect(row).toContainText(`${mine} of your blobs`);
			await expect(row.locator(".tag")).toHaveText(
				publication.owned ? "owner" : "publisher",
			);
		}
		if (publications.length > 4) {
			const more = publications.length - 4;
			await expect(overview(page)).toContainText(
				`And ${more} more ${more === 1 ? "publication" : "publications"}.`,
			);
		}
	});

	test("recent activity is the wallet's latest sent transactions, newest first", async ({
		page,
	}) => {
		const rows = overview(page).locator("li[data-activity]");
		await expect(rows.first()).toBeVisible({ timeout: 60_000 });
		const sent = await sentDigests("testnet", address, 25);
		const hrefs = await rows
			.locator("a.t")
			.evaluateAll((links) =>
				links.map((link) => link.getAttribute("href") ?? ""),
			);
		expect(hrefs.length).toBeGreaterThan(0);
		expect(hrefs.length).toBeLessThanOrEqual(6);
		const positions = hrefs.map((href) => {
			expect(href).toMatch(/^https:\/\/suiscan\.xyz\/testnet\/tx\/\w+$/);
			const digest = href.split("/tx/").at(-1) ?? "";
			const position = sent.indexOf(digest);
			expect(
				position,
				`${digest} among the last 25 sent`,
			).toBeGreaterThanOrEqual(0);
			return position;
		});
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(new Set(positions).size).toBe(positions.length);
	});
});
