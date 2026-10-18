import { expect, type Page, test } from "@playwright/test";
import { connect } from "./app-actions";
import { ownedBlobs, walrusEpoch } from "./chain";
import {
	extendCost,
	isPlain,
	liveCertified,
	nodeClient,
} from "./inspector-actions";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

/**
 * The command palette against Testnet with the test wallet: keyboard
 * first, Go to commands and shortcuts, jump to a blob by name, blob id or
 * object id, and the extend actions with their cost. Nothing is signed.
 */
const funded = keypairFromEnv();
const NETWORK = "testnet";
const DAY_MS = 86_400_000;

function palette(page: Page) {
	return page.getByRole("dialog", { name: "Command palette" });
}

function field(page: Page) {
	return palette(page).getByRole("combobox", {
		name: "Search blobs or type a command",
	});
}

async function open(page: Page): Promise<void> {
	await page.keyboard.press("ControlOrMeta+K");
	await expect(field(page)).toBeFocused();
}

test.describe("command palette on Testnet", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the palette tests.`);

	test.beforeEach(async ({ page }) => {
		if (!funded) return;
		await installTestWallet(page, [funded]);
		await page.goto("/app#files");
		await connect(page, funded.toSuiAddress());
		await page.keyboard.press("Escape");
		await expect(page.locator('tbody tr[aria-level="1"]').first()).toBeVisible({
			timeout: 90_000,
		});
	});

	test("opens with ⌘K, traps focus, moves with the arrows and closes with Escape", async ({
		page,
	}) => {
		const opener = page.getByRole("button", {
			name: /Search blobs, quilts, ids, or type a command/,
		});
		await opener.focus();
		await open(page);
		// Tab stays inside the palette.
		await page.keyboard.press("Tab");
		await expect(field(page)).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		await expect(field(page)).toBeFocused();

		const options = palette(page).getByRole("option");
		const count = await options.count();
		expect(count).toBeGreaterThan(2);
		const activeId = () => field(page).getAttribute("aria-activedescendant");
		const first = await activeId();
		await expect(options.first()).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("ArrowDown");
		expect(await activeId()).not.toBe(first);
		await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
		// Up from the first wraps to the last.
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(options.last()).toHaveAttribute("aria-selected", "true");

		await page.keyboard.press("Escape");
		await expect(palette(page)).toBeHidden();
		await expect(opener).toBeFocused();
	});

	test("goes to places from the palette and the G shortcuts", async ({
		page,
	}) => {
		await open(page);
		await page.keyboard.type("quilts");
		await expect(
			palette(page).getByRole("option", { name: /^Quilts$/ }),
		).toHaveAttribute("aria-selected", "true");
		await page.keyboard.press("Enter");
		await expect(palette(page)).toBeHidden();
		await expect(page).toHaveURL(/#files\/quilts$/);

		await open(page);
		await page.keyboard.type("expiry timeline");
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/#overview$/);
		await expect(page.locator("#expiry-timeline")).toBeInViewport();

		// G then a letter, outside text fields.
		await page.locator("body").press("g");
		await page.locator("body").press("f");
		await expect(page).toHaveURL(/#files$/);
		await page.locator("body").press("g");
		await page.locator("body").press("e");
		await expect(page).toHaveURL(/#files\/expiring$/);
		await page.locator("body").press("g");
		await page.locator("body").press("o");
		await expect(page).toHaveURL(/#overview$/);
		// Letters typed into a field are text, not shortcuts.
		await page.locator("body").press("g");
		await page.locator("body").press("f");
		const filter = page.getByRole("searchbox", { name: /Search blobs/ });
		await filter.click();
		await page.keyboard.type("gf");
		await expect(filter).toHaveValue("gf");
		await expect(page).toHaveURL(/#files$/);
	});

	test("jumps to a blob by name, blob id and object id, and opens it in the inspector", async ({
		page,
	}) => {
		const owner = (funded as NonNullable<typeof funded>).toSuiAddress();
		const [blobs, { epoch }] = await Promise.all([
			ownedBlobs(NETWORK, owner),
			walrusEpoch(NETWORK),
		]);
		const named = liveCertified(blobs, epoch).filter(
			(blob) => isPlain(blob) && blob.attributes.name,
		);
		// A blob no other blob shares its name with, so the name alone finds it.
		const target = named.find(
			(blob) =>
				named.filter((other) => other.attributes.name === blob.attributes.name)
					.length === 1,
		);
		if (!target) throw new Error("No live blob with a name of its own.");
		const label = target.attributes.name ?? "";

		// Start from a filter that hides it: the jump goes to All.
		await page.evaluate(() => {
			window.location.hash = "#files/quilts";
		});
		for (const query of [
			label,
			target.blobId.slice(0, 12),
			target.objectId.slice(2, 16).toUpperCase(),
			target.objectId,
		]) {
			await open(page);
			await page.keyboard.type(query);
			const option = palette(page)
				.getByRole("group", { name: "Blobs" })
				.getByRole("option", { name: new RegExp(`^${escapeRegExp(label)}`) })
				.filter({ hasText: target.blobId.slice(0, 8) });
			await expect(option).toBeVisible();
			await option.click();
			await expect(palette(page)).toBeHidden();
			await expect(page).toHaveURL(/#files$/);
			const panel = page.locator("aside.insp");
			await expect(panel.locator("h3")).toHaveText(label);
			await expect(panel).toContainText(target.blobId, { timeout: 60_000 });
			await expect(
				page.locator(`table.tbl tr[data-key="${target.objectId}"]`),
			).toHaveAttribute("aria-selected", "true");
			await expect(
				page.locator(`table.tbl tr[data-key="${target.objectId}"]`),
			).toBeInViewport();
		}
	});

	test("offers Extend everything expiring with its live cost and opens its sheet", async ({
		page,
	}) => {
		const owner = (funded as NonNullable<typeof funded>).toSuiAddress();
		const [blobs, clock] = await Promise.all([
			ownedBlobs(NETWORK, owner),
			walrusEpoch(NETWORK),
		]);
		const now = Date.now();
		const expiring = blobs.filter(
			(blob) =>
				blob.certifiedEpoch !== null &&
				blob.endEpoch > clock.epoch &&
				blob.endEpoch - clock.epoch < 53 &&
				clock.epochStartMs +
					(blob.endEpoch - clock.epoch) * clock.epochDurationMs -
					now <
					30 * DAY_MS,
		);
		const { storage_price_per_unit_size } =
			await nodeClient().walrus.systemState();
		const total = expiring.reduce(
			(sum, blob) =>
				sum +
				extendCost(blob.encodedSize, 1, BigInt(storage_price_per_unit_size)),
			0n,
		);

		await open(page);
		await page.keyboard.type("extend");
		const option = palette(page).getByRole("option", {
			name: /Extend everything expiring in 30 days/,
		});
		await expect(option).toHaveAttribute("aria-selected", "true");
		await expect(option).toContainText(`${expiring.length} blobs`);
		await expect(option).toContainText("WAL");
		// The compact cost rounds; the sheet then shows the exact total.
		await page.keyboard.press("Enter");
		const sheet = page.getByRole("dialog", {
			name: "Extend everything expiring",
		});
		await expect(sheet).toBeVisible();
		const dd = sheet
			.locator(".cost dt", { hasText: /^Storage, 1 epoch each/ })
			.locator("xpath=following-sibling::dd");
		await expect
			.poll(async () =>
				dd.evaluate(
					(node) => (node.querySelector(".sr-only") ?? node).textContent ?? "",
				),
			)
			.toBe(decimalOf(total));
		await sheet.getByRole("button", { name: "Cancel" }).click();
		await expect(sheet).toBeHidden();
	});
});

/** A raw 9-decimal amount as the exact decimal the app's detailed amounts read out. */
function decimalOf(raw: bigint): string {
	const whole = raw / 1_000_000_000n;
	const fraction = (raw % 1_000_000_000n)
		.toString()
		.padStart(9, "0")
		.replace(/0+$/, "");
	return fraction ? `${whole}.${fraction}` : whole.toString();
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
