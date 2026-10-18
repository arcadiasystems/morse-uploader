import type { Keypair } from "@mysten/sui/cryptography";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { connect, openProfileMenu } from "./app-actions";
import {
	type ChainBlob,
	type Network,
	ownedBlobs,
	quiltPatchIdentifiers,
	walrusEpoch,
} from "./chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

const funded = keypairFromEnv();
const DAY_MS = 86_400_000;

/** What one blob row shows, read from the page. */
interface PaneRow {
	objectId: string;
	/** The full blob id behind the shortened one. */
	blobId: string;
	sizeTitle: string;
	expiryTitle: string;
	status: string;
	label: string;
}

/**
 * Every top-level row of the list. Only rows on screen are rendered, so this
 * scrolls the list from top to bottom and collects them on the way.
 */
async function collectRows(page: Page): Promise<PaneRow[]> {
	return page.evaluate(async () => {
		const scroller = document.querySelector<HTMLElement>(".pane.remote .list");
		if (!scroller) throw new Error("The blob list is not on screen.");
		const frame = () =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			);
		const rows = new Map<string, PaneRow>();
		const read = () => {
			for (const row of scroller.querySelectorAll<HTMLElement>(
				'tbody tr[aria-level="1"]',
			)) {
				const objectId = row.dataset.key ?? "";
				rows.set(objectId, {
					objectId,
					blobId: row.querySelector<HTMLElement>(".bid")?.title ?? "",
					sizeTitle: row.querySelector<HTMLElement>(".sz")?.title ?? "",
					expiryTitle: row.querySelector<HTMLElement>(".ex")?.title ?? "",
					status: row.querySelector(".st .chip")?.textContent ?? "",
					// Quilts read as folders: drop the trailing slash.
					label: (row.querySelector(".nm > span")?.textContent ?? "").replace(
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
 * The status chip the notes' rules give a blob, computed here from GraphQL
 * data. `null` when the blob sits within an hour of a day boundary, where the
 * read times of the test and the app could disagree.
 */
function expectedStatus(
	blob: ChainBlob,
	clock: { epoch: number; epochStartMs: number; epochDurationMs: number },
): string | RegExp | null {
	if (blob.endEpoch <= clock.epoch) return "Expired";
	if (blob.certifiedEpoch === null) return "Registered";
	const msLeft = Math.max(
		0,
		clock.epochStartMs +
			(blob.endEpoch - clock.epoch) * clock.epochDurationMs -
			Date.now(),
	);
	const days = msLeft / DAY_MS;
	if (Math.abs(days - Math.round(days)) < 1 / 24) return null;
	if (days >= 30) return blob.attributes.seal ? "Encrypted" : "Certified";
	const whole = Math.floor(days);
	return whole < 1 ? "< 1 day" : whole === 1 ? "1 day" : `${whole} days`;
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

function pane(page: Page, network: Network): Locator {
	return page.getByRole("region", {
		name: network === "testnet" ? "Walrus Testnet" : "Walrus Mainnet",
	});
}

function grid(page: Page): Locator {
	return page.getByRole("treegrid");
}

async function waitForList(page: Page, count: number): Promise<void> {
	await expect(page.locator(".pane.remote .ft")).toContainText(
		`${count} ${count === 1 ? "blob" : "blobs"}`,
		{ timeout: 60_000 },
	);
}

test.describe("Walrus pane, read from chain", () => {
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
		await page.goto("/app");
		await connect(page, address);
		await page.keyboard.press("Escape");
		await waitForList(page, chain.length);
	});

	test("lists every owned Blob with the chain's ids, sizes, end epochs and statuses", async ({
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
			expect(row?.blobId, blob.objectId).toBe(blob.blobId);
			expect(row?.sizeTitle, blob.objectId).toMatch(
				new RegExp(`^${blob.size.toLocaleString("en-US")} bytes`),
			);
			expect(row?.expiryTitle, blob.objectId).toContain(
				`epoch ${blob.endEpoch} `,
			);
			const status = expectedStatus(blob, clock);
			if (status !== null) expect(row?.status, blob.objectId).toBe(status);
		}

		const sidebar = page.getByRole("complementary", { name: "Sidebar" });
		const count = async (view: string) =>
			sidebar.getByRole("button", { name: view }).locator(".n").textContent();
		const quilts = chain.filter(
			(blob) => blob.attributes._walrusBlobType === "quilt",
		);
		const expired = chain.filter((blob) => blob.endEpoch <= clock.epoch);
		expect(await count("All blobs")).toBe(String(chain.length));
		expect(await count("Quilts")).toBe(String(quilts.length));
		expect(await count("Expired")).toBe(String(expired.length));
		await expect(page.locator(".pane.remote .ft")).toContainText(
			`${quilts.length} ${quilts.length === 1 ? "quilt" : "quilts"}`,
		);
	});

	test("searches names, blob ids and object ids, ignoring case, from ⌘K", async ({
		page,
	}) => {
		const target = chain[0];
		if (!target) throw new Error("The test wallet owns no blobs.");
		await page.keyboard.press("ControlOrMeta+K");
		const search = page.getByRole("searchbox", { name: /Search blobs/ });
		await expect(search).toBeFocused();

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
		await waitForList(page, chain.length);

		await search.focus();
		await search.fill("abc");
		await page.keyboard.press("Escape");
		await expect(search).toHaveValue("");
	});

	test("sorts by name, size, expiry and status", async ({ page }) => {
		const header = (name: string) =>
			grid(page).getByRole("columnheader", { name });
		const sizes = async () =>
			(await collectRows(page)).map((row) =>
				Number(row.sizeTitle.split(" ")[0]?.replaceAll(",", "")),
			);
		const ends = async () =>
			(await collectRows(page)).map((row) =>
				Number(/epoch (\d+) /.exec(row.expiryTitle)?.[1]),
			);

		// Default: the longest-paid first.
		await expect(header("Expires")).toHaveAttribute("aria-sort", "descending");
		const defaultEnds = await ends();
		expect(defaultEnds).toEqual([...defaultEnds].sort((a, b) => b - a));

		await header("Expires").getByRole("button").click();
		await expect(header("Expires")).toHaveAttribute("aria-sort", "ascending");
		const ascendingEnds = await ends();
		expect(ascendingEnds).toEqual([...ascendingEnds].sort((a, b) => a - b));

		await header("Size").getByRole("button").click();
		await expect(header("Size")).toHaveAttribute("aria-sort", "descending");
		const descendingSizes = await sizes();
		expect(descendingSizes).toEqual([...descendingSizes].sort((a, b) => b - a));
		await header("Size").getByRole("button").click();
		const ascendingSizes = await sizes();
		expect(ascendingSizes).toEqual([...ascendingSizes].sort((a, b) => a - b));

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

		await header("Status").getByRole("button").click();
		await expect(header("Status")).toHaveAttribute("aria-sort", "ascending");
		const rank = (status: string) =>
			/day/.test(status)
				? 0
				: ["Registered", "Expired", "Encrypted", "Certified"].indexOf(status) +
					1;
		const ranks = (await collectRows(page)).map((row) => rank(row.status));
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	test("opens a quilt to the patch identifiers the aggregator lists", async ({
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
		// The patch count comes from the quilt index on storage nodes.
		await expect(row).toContainText(
			`${identifiers.length} ${identifiers.length === 1 ? "patch" : "patches"}`,
			{ timeout: 90_000 },
		);

		await row.locator(".tw").click();
		await expect(row).toHaveAttribute("aria-expanded", "true");
		const patches = grid(page).locator('tbody tr[aria-level="2"]');
		await expect(patches).toHaveCount(identifiers.length, { timeout: 90_000 });
		expect(await patches.locator(".nm").allTextContents()).toEqual(identifiers);

		// Left on a patch goes to its quilt; Left again closes it.
		await patches.first().click();
		await page.keyboard.press("ArrowLeft");
		await expect(row).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowLeft");
		await expect(row).toHaveAttribute("aria-expanded", "false");
		await expect(patches).toHaveCount(0);
		await page.keyboard.press("ArrowRight");
		await expect(row).toHaveAttribute("aria-expanded", "true");
	});

	test("selects rows from the keyboard and enables only read-only actions", async ({
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
		const tools = page.locator(".pane.remote .tools");
		await expect(
			tools.getByRole("button", { name: "Copy blob id" }),
		).toBeDisabled();

		await page
			.getByRole("searchbox", { name: /Search blobs/ })
			.fill(target.objectId);
		await grid(page).focus();
		await page.keyboard.press("ArrowDown");
		const row = grid(page).locator(`tr[data-key="${target.objectId}"]`);
		await expect(row).toHaveAttribute("aria-selected", "true");
		await expect(row).toHaveClass(/\bsel\b/);

		await expect(tools.getByRole("link", { name: "Download" })).toHaveAttribute(
			"href",
			`https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-object-id/${target.objectId}`,
		);
		for (const action of ["Extend", "Share", "Verify", "Publish to Morse"])
			await expect(tools.getByRole("button", { name: action })).toBeDisabled();
		await expect(page.locator(".pane.remote .ft .info")).toContainText(
			`ends ${target.endEpoch}`,
		);

		await tools.getByRole("button", { name: "Copy blob id" }).click();
		await expect(
			tools.getByRole("button", { name: "Blob id copied" }),
		).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			target.blobId,
		);

		await grid(page).focus();
		await page.keyboard.press("Escape");
		await expect(row).toHaveAttribute("aria-selected", "false");
		await expect(
			tools.getByRole("button", { name: "Download" }),
		).toBeDisabled();
	});

	test("Refresh reads the list from chain again", async ({ page }) => {
		const request = page.waitForRequest((sent) =>
			sent.url().includes("/sui.rpc.v2.StateService/ListOwnedObjects"),
		);
		await pane(page, "testnet")
			.getByRole("button", { name: "Refresh" })
			.click();
		await request;
		await expect(
			pane(page, "testnet").getByRole("button", { name: "Refresh" }),
		).toBeEnabled();
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
		await expect(
			pane(page, "mainnet").getByText("No blobs on Walrus Mainnet"),
		).toBeVisible({ timeout: 60_000 });
		await expect(page.locator(".pane.remote .ft")).toContainText("0 blobs");
		await expect(
			page
				.getByRole("complementary", { name: "Sidebar" })
				.getByRole("button", { name: "All blobs" })
				.locator(".n"),
		).toHaveText("0");

		menu = await openProfileMenu(page);
		await menu.getByRole("radio", { name: "Testnet" }).check();
		await page.keyboard.press("Escape");
		await expect(pane(page, "testnet")).toBeVisible();
		await waitForList(page, chain.length);
		expect((await collectRows(page)).length).toBe(chain.length);
	});

	test("at 390 the pane fills the screen, rows show name and size, nothing overflows", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const region = pane(page, "testnet");
		expect((await region.boundingBox())?.width).toBe(390);
		const first = grid(page).locator('tbody tr[aria-level="1"]').first();
		await expect(first.locator(".nm")).toBeVisible();
		await expect(first.locator(".sz")).toBeVisible();
		await expect(first.locator(".ex")).toBeHidden();
		await expect(first.locator(".st")).toBeHidden();
		const { scrollWidth, innerWidth } = await page.evaluate(() => ({
			scrollWidth: document.documentElement.scrollWidth,
			innerWidth: window.innerWidth,
		}));
		expect(scrollWidth).toBe(innerWidth);
		// The list scrolls inside the pane, so it stays virtual on phones.
		const rendered = await grid(page).locator("tbody tr").count();
		expect(rendered).toBeLessThan(Math.max(chain.length, 40));
	});
});
