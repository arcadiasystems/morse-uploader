import type { Keypair } from "@mysten/sui/cryptography";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { connect, openProfileMenu, short } from "./app-actions";
import {
	type ChainBlob,
	ownedBlobs,
	quiltPatchIdentifiers,
	walrusEpoch,
} from "./chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

const funded = keypairFromEnv();
const DAY_MS = 86_400_000;

/** What one blob row shows, read from the page. */
interface ListRow {
	objectId: string;
	/** The full blob id behind the shortened one; empty when the row shows none. */
	blobId: string;
	sizeTitle: string;
	/** The storage-left cell's title: "Storage ends when epoch N starts, ...". */
	lifeTitle: string;
	/** The uploaded cell's title: "Registered in epoch N, ...". */
	uploadedTitle: string;
	/** The storage-left caption: "12 d", "< 1 d", "finish" or "expired". */
	life: string;
	expired: boolean;
	label: string;
}

/**
 * Every top-level row of the list. Only rows on screen are rendered, so this
 * scrolls the Files view from top to bottom and collects them on the way.
 */
async function collectRows(page: Page): Promise<ListRow[]> {
	return page.evaluate(async () => {
		const scroller = document.querySelector<HTMLElement>(
			'section[aria-label="Files"]',
		);
		if (!scroller) throw new Error("The Files view is not on screen.");
		const frame = () =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
		const rows = new Map<string, ListRow>();
		const read = () => {
			for (const row of scroller.querySelectorAll<HTMLElement>(
				'tbody tr[aria-level="1"]',
			)) {
				const objectId = row.dataset.key ?? "";
				rows.set(objectId, {
					objectId,
					blobId: row.querySelector<HTMLElement>(".bid")?.title ?? "",
					sizeTitle: row.querySelector<HTMLElement>("td.sz")?.title ?? "",
					lifeTitle: row.querySelector<HTMLElement>("td.life")?.title ?? "",
					uploadedTitle: row.querySelector<HTMLElement>("td.dt")?.title ?? "",
					life: row.querySelector("td.life small")?.textContent ?? "",
					expired: row.classList.contains("exp"),
					// Quilts read as folders: drop the trailing slash.
					label: (row.querySelector("td.nm > span")?.textContent ?? "").replace(
						/\/$/,
						"",
					),
				});
			}
		};
		scroller.scrollTop = 0;
		await frame();
		for (;;) {
			read();
			if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight)
				break;
			scroller.scrollTop += Math.floor(scroller.clientHeight * 0.8);
			await frame();
		}
		scroller.scrollTop = 0;
		await frame();
		return [...rows.values()];
	});
}

/**
 * The storage-left caption the notes' rules give a blob, computed here from
 * GraphQL data. `null` when the blob sits within an hour of a day boundary,
 * where the read times of the test and the app could disagree.
 */
function expectedLife(
	blob: ChainBlob,
	clock: { epoch: number; epochStartMs: number; epochDurationMs: number },
): string | null {
	if (blob.endEpoch <= clock.epoch) return "expired";
	if (blob.certifiedEpoch === null) return "finish";
	const msLeft = Math.max(
		0,
		clock.epochStartMs +
			(blob.endEpoch - clock.epoch) * clock.epochDurationMs -
			Date.now(),
	);
	const days = msLeft / DAY_MS;
	if (Math.abs(days - Math.round(days)) < 1 / 24) return null;
	const whole = Math.floor(days);
	return whole < 1 ? "< 1 d" : `${whole} d`;
}

/** The blobs a search should list: name, blob id or object id contain it, ignoring case. */
function searchMatches(
	blobs: readonly ChainBlob[],
	query: string,
): ChainBlob[] {
	const needle = query.toLowerCase();
	return blobs.filter((blob) =>
		[blob.attributes.name ?? "", blob.blobId, blob.objectId].some((field) =>
			field.toLowerCase().includes(needle),
		),
	);
}

function isLiveQuilt(blob: ChainBlob, epoch: number): boolean {
	return (
		blob.attributes._walrusBlobType === "quilt" &&
		blob.certifiedEpoch !== null &&
		blob.endEpoch > epoch
	);
}

function grid(page: Page): Locator {
	return page.getByRole("treegrid");
}

/** The count a filter chip shows. */
async function chipCount(page: Page, label: string): Promise<string | null> {
	return page
		.getByRole("navigation", { name: "Filters" })
		.getByRole("link", { name: new RegExp(`^${label}`) })
		.locator(".n")
		.textContent();
}

/** Waits until the top bar's context line counts the wallet's blobs. */
async function waitForList(page: Page, count: number): Promise<void> {
	await expect(page.locator("header.top .ctx")).toContainText(
		`${count} ${count === 1 ? "blob" : "blobs"}`,
		{ timeout: 60_000 },
	);
}

test.describe("Files, read from chain", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the wallet tests.`);
	test.use({ permissions: ["clipboard-read", "clipboard-write"] });

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
		await waitForList(page, chain.length);
		await expect(grid(page)).toBeVisible();
	});

	test("lists every owned Blob with the chain's ids, sizes, end epochs and storage clock", async ({
		page,
	}) => {
		expect(chain.length).toBeGreaterThan(0);
		const clock = await walrusEpoch("testnet");
		const rows = await collectRows(page);
		const byId = new Map(rows.map((row) => [row.objectId, row]));
		expect([...byId.keys()].sort()).toEqual(
			chain.map((blob) => blob.objectId).sort(),
		);
		for (const blob of chain) {
			const row = byId.get(blob.objectId);
			const expired = blob.endEpoch <= clock.epoch;
			// An expired named blob's second line is "expired <date> · record
			// stays on Sui", as the design writes it, without its blob id.
			if (!(expired && blob.attributes.name))
				expect(row?.blobId, blob.objectId).toBe(blob.blobId);
			expect(row?.sizeTitle, blob.objectId).toMatch(
				new RegExp(`^${blob.size.toLocaleString("en-US")} bytes`),
			);
			expect(row?.lifeTitle, blob.objectId).toContain(
				`epoch ${blob.endEpoch} `,
			);
			expect(row?.expired, blob.objectId).toBe(expired);
			const life = expectedLife(blob, clock);
			if (life !== null) expect(row?.life, blob.objectId).toBe(life);
		}

		const quilts = chain.filter(
			(blob) => blob.attributes._walrusBlobType === "quilt",
		);
		expect(await chipCount(page, "All")).toBe(String(chain.length));
		expect(await chipCount(page, "Quilts")).toBe(String(quilts.length));
		await expect(page.locator("header.top .ctx")).toContainText(short(address));
	});

	test("filters names, blob ids and object ids, ignoring case, from the Files filter box", async ({
		page,
	}) => {
		const target = chain[0];
		if (!target) throw new Error("The test wallet owns no blobs.");
		// ⌘K opens the command palette; the filter box stays on the Files view.
		await page.keyboard.press("ControlOrMeta+K");
		await expect(
			page.getByRole("dialog", { name: "Command palette" }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("dialog", { name: "Command palette" }),
		).toBeHidden();
		const search = page.getByRole("searchbox", { name: /Search blobs/ });
		await expect(search).toBeVisible();

		const objectFragment = target.objectId.slice(2, 14).toUpperCase();
		await search.fill(objectFragment);
		await expect(grid(page).locator('tbody tr[aria-level="1"]')).toHaveCount(
			searchMatches(chain, objectFragment).length,
		);
		await expect(
			grid(page).locator(`tr[data-key="${target.objectId}"]`),
		).toBeVisible();

		const blobFragment = target.blobId.slice(3, 15).toLowerCase();
		await search.fill(blobFragment);
		await expect(grid(page).locator('tbody tr[aria-level="1"]')).toHaveCount(
			searchMatches(chain, blobFragment).length,
		);
		await expect(
			grid(page).locator(`tr[data-key="${target.objectId}"]`),
		).toBeVisible();

		await search.fill("no-such-blob-zz");
		await expect(
			page.getByText("No blobs match “no-such-blob-zz”"),
		).toBeVisible();
		await page.getByRole("button", { name: "Clear search" }).click();
		await expect(search).toHaveValue("");
		await expect(grid(page)).toBeVisible();

		await search.focus();
		await search.fill("abc");
		await page.keyboard.press("Escape");
		await expect(search).toHaveValue("");
	});

	test("sorts by uploaded, storage left, size and name, from the headers and the sort control", async ({
		page,
	}) => {
		const header = (name: string) =>
			grid(page).getByRole("columnheader", { name });
		const epochs = async (field: "uploadedTitle" | "lifeTitle") =>
			(await collectRows(page)).map((row) =>
				Number(/epoch (\d+)/.exec(row[field])?.[1]),
			);
		const sizes = async () =>
			(await collectRows(page)).map((row) =>
				Number(row.sizeTitle.split(" ")[0]?.replaceAll(",", "")),
			);
		const ascending = (values: number[]) =>
			expect(values).toEqual([...values].sort((a, b) => a - b));
		const descending = (values: number[]) =>
			expect(values).toEqual([...values].sort((a, b) => b - a));

		// Default: the newest upload first, by registered epoch.
		await expect(header("Uploaded")).toHaveAttribute("aria-sort", "descending");
		descending(await epochs("uploadedTitle"));

		await header("Storage left").getByRole("button").click();
		await expect(header("Storage left")).toHaveAttribute(
			"aria-sort",
			"ascending",
		);
		ascending(await epochs("lifeTitle"));
		await header("Storage left").getByRole("button").click();
		descending(await epochs("lifeTitle"));

		await header("Size").getByRole("button").click();
		await expect(header("Size")).toHaveAttribute("aria-sort", "descending");
		descending(await sizes());
		await header("Size").getByRole("button").click();
		ascending(await sizes());

		await header("Name").getByRole("button").click();
		await expect(header("Name")).toHaveAttribute("aria-sort", "ascending");
		const names = (await collectRows(page)).map((row) => row.label);
		const collator = new Intl.Collator("en", {
			numeric: true,
			sensitivity: "base",
		});
		for (let index = 1; index < names.length; index += 1) {
			expect(
				collator.compare(names[index - 1] ?? "", names[index] ?? ""),
			).toBeLessThanOrEqual(0);
		}

		// The sort control names the same orders.
		await page.getByRole("combobox", { name: "Sort by" }).selectOption({
			label: "oldest",
		});
		await expect(header("Uploaded")).toHaveAttribute("aria-sort", "ascending");
		ascending(await epochs("uploadedTitle"));
	});

	test("opens a quilt in place to the files the aggregator lists", async ({
		page,
	}) => {
		const { epoch } = await walrusEpoch("testnet");
		const quilt = chain.find((blob) => isLiveQuilt(blob, epoch));
		test.skip(!quilt, "The test wallet owns no certified, unexpired quilt.");
		if (!quilt) return;
		const identifiers = await quiltPatchIdentifiers("testnet", quilt.blobId);

		const search = page.getByRole("searchbox", { name: /Search blobs/ });
		await search.fill(quilt.objectId);
		const row = grid(page).locator(`tr[data-key="${quilt.objectId}"]`);
		await expect(row).toHaveAttribute("aria-expanded", "false");
		// The file count comes from the quilt index on storage nodes.
		await expect(row).toContainText(
			`${identifiers.length} ${identifiers.length === 1 ? "file" : "files"}`,
			{ timeout: 90_000 },
		);

		await row.locator(".tw").click();
		await expect(row).toHaveAttribute("aria-expanded", "true");
		const files = grid(page).locator('tbody tr[aria-level="2"]');
		await expect(files).toHaveCount(identifiers.length, { timeout: 90_000 });
		expect(await files.locator("td.nm").allTextContents()).toEqual(identifiers);

		// Left on a file goes to its quilt; Left again closes it.
		await files.first().locator("td.nm").click();
		await page.keyboard.press("ArrowLeft");
		await expect(row).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowLeft");
		await expect(row).toHaveAttribute("aria-expanded", "false");
		await expect(files).toHaveCount(0);
		await page.keyboard.press("ArrowRight");
		await expect(row).toHaveAttribute("aria-expanded", "true");
	});

	test("selects rows from the keyboard, opens the inspector, and acts from the row menu", async ({
		page,
	}) => {
		const { epoch } = await walrusEpoch("testnet");
		const target = chain.find(
			(blob) =>
				blob.certifiedEpoch !== null &&
				blob.endEpoch > epoch &&
				!blob.attributes._walrusBlobType &&
				!blob.attributes.seal,
		);
		if (!target) throw new Error("The test wallet owns no live plain blob.");

		await page
			.getByRole("searchbox", { name: /Search blobs/ })
			.fill(target.objectId);
		await grid(page).focus();
		await page.keyboard.press("ArrowDown");
		const row = grid(page).locator(`tr[data-key="${target.objectId}"]`);
		await expect(row).toHaveAttribute("aria-selected", "true");
		await expect(row).toHaveClass(/\bsel\b/);
		// Activating a row opens the inspector beside the list.
		const panel = page.locator("aside.insp");
		await expect(panel).toBeVisible();
		// The record's epochs line: "registered N · certified N · ends N".
		await expect(panel).toContainText(`ends ${target.endEpoch}`, {
			timeout: 60_000,
		});

		// The row menu: the inspector's actions, Select, Download, and the blob id.
		await row.locator("button.more").click();
		const menu = page.getByRole("menu", { name: /^Actions for / });
		await expect(menu).toBeVisible();
		await expect(
			menu.getByRole("menuitem", { name: "Download" }),
		).toHaveAttribute(
			"href",
			`https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-object-id/${target.objectId}`,
		);
		for (const action of [
			"Details",
			"Extend",
			"Share",
			"Verify",
			"Publish to Morse",
			"Select",
		])
			await expect(menu.getByRole("menuitem", { name: action })).toBeEnabled();
		await menu.getByRole("menuitem", { name: "Copy blob id" }).click();
		await expect(
			menu.getByRole("menuitem", { name: "Blob id copied" }),
		).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			target.blobId,
		);
		await page.getByRole("menuitem", { name: "Verify" }).click();
		await expect(menu).toBeHidden();
		await expect(
			page.locator("aside.insp #insp-verify-title"),
		).toBeInViewport();
		// The menu's Verify runs the check, not only shows the section.
		await expect(page.locator("aside.insp #insp-verify .ver")).toContainText(
			/Rebuilding the blob|Bytes match the blob id/,
		);

		// A row's checkbox selects it without opening anything, and raises the bulk bar.
		await page.getByRole("button", { name: "Close details" }).click();
		await row.getByRole("checkbox").check();
		await expect(panel).toBeHidden();
		await expect(
			page.getByRole("toolbar", { name: "Selected blobs" }),
		).toContainText("1 selected");
		await page.getByRole("button", { name: "Clear the selection" }).click();
		await expect(
			page.getByRole("toolbar", { name: "Selected blobs" }),
		).toBeHidden();

		await grid(page).focus();
		await page.keyboard.press("Escape");
		await expect(row).toHaveAttribute("aria-selected", "false");
	});

	test("Refresh reads the list from chain again", async ({ page }) => {
		const request = page.waitForRequest((sent) =>
			sent.url().includes("/sui.rpc.v2.StateService/ListOwnedObjects"),
		);
		const refresh = page
			.getByRole("region", { name: "Files" })
			.getByRole("button", { name: "Refresh" });
		await refresh.click();
		await request;
		await expect(refresh).toBeEnabled({ timeout: 60_000 });
		await waitForList(page, chain.length);
		expect((await collectRows(page)).length).toBe(chain.length);
	});

	test("switching to Walrus Mainnet empties the list, and back refills it", async ({
		page,
	}) => {
		// The test wallet owns nothing on Walrus Mainnet.
		expect(await ownedBlobs("mainnet", address)).toEqual([]);
		let menu = await openProfileMenu(page);
		await menu.getByRole("radio", { name: "Walrus Mainnet" }).check();
		await page.keyboard.press("Escape");
		await expect(page.getByText("No blobs on Walrus Mainnet")).toBeVisible({
			timeout: 60_000,
		});
		await waitForList(page, 0);
		expect(await chipCount(page, "All")).toBe("0");
		await expect(page.locator("header.top button.net")).toContainText(
			"Walrus Mainnet",
		);

		menu = await openProfileMenu(page);
		await menu.getByRole("radio", { name: "Testnet" }).check();
		await page.keyboard.press("Escape");
		await waitForList(page, chain.length);
		expect((await collectRows(page)).length).toBe(chain.length);
	});

	test("at 390 rows show name, size and the menu, and the list stays virtual", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const view = page.getByRole("region", { name: "Files" });
		expect((await view.boundingBox())?.width).toBe(390);
		const first = grid(page).locator('tbody tr[aria-level="1"]').first();
		await expect(first.locator("td.nm")).toBeVisible();
		await expect(first.locator("td.sz")).toBeVisible();
		await expect(first.locator("button.more")).toBeVisible();
		await expect(first.locator("td.dt")).toBeHidden();
		await expect(first.locator("td.life")).toBeHidden();
		const { scrollWidth, innerWidth } = await page.evaluate(() => ({
			scrollWidth: document.documentElement.scrollWidth,
			innerWidth: window.innerWidth,
		}));
		expect(scrollWidth).toBe(innerWidth);
		// The list scrolls inside the view, so it stays virtual on phones.
		const rendered = await grid(page).locator("tbody tr").count();
		expect(rendered).toBeLessThan(Math.max(chain.length, 40));
	});
});
