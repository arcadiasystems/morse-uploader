import { expect, type Page, test } from "@playwright/test";

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
		await expect(
			page.getByRole("link", { name: "Open Morse Uploader" }),
		).toHaveAttribute("href", "/app");
		const { scrollWidth, innerWidth } = await horizontalOverflow(page);
		expect(scrollWidth).toBe(innerWidth);
	});

	test("/app has no horizontal overflow at 390; the Walrus pane fills the screen", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/app");
		const walrusPane = page.getByRole("region", { name: "Walrus Testnet" });
		await expect(walrusPane).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "This computer" }),
		).toBeHidden();
		const box = await walrusPane.boundingBox();
		expect(box?.width).toBe(390);
		const { scrollWidth, innerWidth } = await horizontalOverflow(page);
		expect(scrollWidth).toBe(innerWidth);
	});

	test("Coming features are visibly disabled", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const sidebar = page.getByRole("complementary", { name: "Sidebar" });
		for (const feature of [
			"Download for Mac",
			"One-signature batch register",
			"Walrus Sites deploy",
			"Agents and keys (MCP)",
		]) {
			const item = sidebar.getByRole("button", { name: feature });
			await expect(item).toBeDisabled();
			await expect(item).toContainText("Coming");
		}
	});

	test("the network switch works before connecting and survives a reload", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		await page
			.getByRole("banner")
			.getByRole("button", { name: "Connect wallet" })
			.click();
		const menu = page.getByRole("dialog", {
			name: "Profiles, network and wallet",
		});
		await menu.getByRole("radio", { name: "Walrus Mainnet" }).check();
		await expect(
			page.getByRole("region", { name: "Walrus Mainnet" }),
		).toBeVisible();
		await expect(page.getByRole("banner")).toContainText("Walrus Mainnet");
		await expect(page.getByText(/FROST\/MiB\/epoch/)).toBeVisible();

		await page.reload();
		await expect(
			page.getByRole("region", { name: "Walrus Mainnet" }),
		).toBeVisible();
	});

	test("the profile menu is reachable and dismissible from the keyboard", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const trigger = page
			.getByRole("banner")
			.getByRole("button", { name: "Connect wallet" });
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
});
