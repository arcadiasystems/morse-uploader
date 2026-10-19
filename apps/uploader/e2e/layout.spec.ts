import { expect, type Page, test } from "@playwright/test";
import { profileTrigger } from "./app-actions";

async function horizontalOverflow(
	page: Page,
): Promise<{ scrollWidth: number; innerWidth: number }> {
	return page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth,
	}));
}

test.describe("layout without a wallet", () => {
	test("/ has no horizontal overflow at 390 and links to the app", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		// The hero and the uploader's card both open the app.
		const openApp = page.getByRole("link", { name: "Open Morse Uploader" });
		await expect(openApp).toHaveCount(2);
		for (const link of await openApp.all())
			await expect(link).toHaveAttribute("href", "/app");
		const { scrollWidth, innerWidth } = await horizontalOverflow(page);
		expect(scrollWidth).toBe(innerWidth);
	});

	test("/app has no horizontal overflow at 390; the rail is a tab bar along the bottom", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/app");
		const overview = page.getByRole("region", { name: "Overview" });
		await expect(overview).toBeVisible();
		expect((await overview.boundingBox())?.width).toBe(390);
		const bar = await page
			.getByRole("navigation", { name: "Views" })
			.boundingBox();
		expect(bar?.width).toBe(390);
		expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBe(844);
		const { scrollWidth, innerWidth } = await horizontalOverflow(page);
		expect(scrollWidth).toBe(innerWidth);
	});

	test("Coming features are visibly disabled", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const rail = page.getByRole("navigation", { name: "Views" });
		const agents = rail.getByRole("button", {
			name: "Agents and keys (MCP), coming",
		});
		await expect(agents).toBeDisabled();
		await expect(agents).toContainText("soon");

		await rail.getByRole("button", { name: "More" }).click();
		const more = page.getByRole("dialog", { name: "More" });
		for (const feature of [
			"Desktop app",
			"One-signature batching",
			"Walrus Sites deploy",
			"Agents and keys (MCP)",
		]) {
			const item = more.getByRole("button", { name: feature });
			await expect(item).toBeDisabled();
			await expect(item).toContainText("Coming");
		}
	});

	test("the network switch works before connecting and survives a reload", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		await profileTrigger(page).click();
		const menu = page.getByRole("dialog", {
			name: "Profiles, network and wallet",
		});
		await menu.getByRole("radio", { name: "Walrus Mainnet" }).check();
		const network = page.locator("header.top .net");
		await expect(network).toHaveText("Walrus Mainnet");
		await page.keyboard.press("Escape");
		// The Overview prices the network from its Walrus system object.
		await expect(page.getByText("WAL / GiB·epoch")).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByRole("region", { name: "Overview" })).toContainText(
			"on Walrus Mainnet",
		);

		await page.reload();
		await expect(network).toHaveText("Walrus Mainnet");
	});

	test("the profile menu is reachable and dismissible from the keyboard", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const trigger = profileTrigger(page);
		await expect(trigger).toHaveAccessibleName("Connect wallet");
		await trigger.focus();
		await page.keyboard.press("Enter");
		const menu = page.getByRole("dialog", {
			name: "Profiles, network and wallet",
		});
		await expect(menu).toBeVisible();
		await expect(menu.locator(":focus")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden();
		await expect(trigger).toBeFocused();
	});

	test("without a wallet the Overview asks to connect, prices Walrus, and Upload waits", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const overview = page.getByRole("region", { name: "Overview" });
		await expect(
			overview.getByRole("heading", { name: "Connect a wallet" }),
		).toBeVisible();
		await expect(overview.getByText("Price right now")).toBeVisible();
		await expect(overview.getByText("WAL / GiB·epoch")).toBeVisible({
			timeout: 60_000,
		});
		// The drop zone needs a wallet to stage into.
		await expect(
			page.getByRole("region", { name: "Add files to upload" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Upload", exact: true }),
		).toBeDisabled();
		await expect(page.locator("header.top .ctx")).toHaveText("Not connected");

		await page.goto("/app#files");
		await expect(
			page
				.getByRole("region", { name: "Files" })
				.getByText("Connect a wallet", { exact: true }),
		).toBeVisible();
	});
});
