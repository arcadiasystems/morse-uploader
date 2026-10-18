import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

	test("the local pane lists a picked folder as a tree with sizes and selection", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const root = test.info().outputPath("site-export");
		for (const [path, text] of Object.entries({
			"index.html": "<h1>Hi</h1>",
			"assets/logo.svg": "<svg/>",
			"assets/style.css": "body{}",
		})) {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await writeFile(join(root, path), text);
		}
		await page.locator('input[data-picker="folder"]').setInputFiles(root);

		const local = page.getByRole("region", { name: "This computer" });
		const folder = local.getByRole("button", {
			name: /site-export\/\s*3 files/,
		});
		await expect(folder).toHaveAttribute("aria-expanded", "false");
		await expect(local.locator(".ft")).toContainText("3 files");
		await expect(local.locator(".ft")).toContainText("3 selected · 23 B");

		await folder.click();
		await expect(folder).toHaveAttribute("aria-expanded", "true");
		await local.getByRole("button", { name: /assets\/\s*2 files/ }).click();
		await expect(local.getByText("logo.svg")).toBeVisible();

		await local.getByRole("checkbox", { name: "index.html" }).uncheck();
		await expect(local.locator(".ft")).toContainText("2 selected · 12 B");
		const folderBox = local.getByRole("checkbox", {
			name: /Select site-export\//,
		});
		expect(
			await folderBox.evaluate(
				(box) => (box as HTMLInputElement).indeterminate,
			),
		).toBe(true);

		// Uploading needs a wallet.
		await expect(
			page.getByRole("button", { name: "Upload", exact: true }),
		).toBeDisabled();
	});

	test("files dropped on the local pane are listed and selected", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
		const local = page.getByRole("region", { name: "This computer" });
		const transfer = await page.evaluateHandle(() => {
			const data = new DataTransfer();
			data.items.add(new File(["one"], "one.txt", { type: "text/plain" }));
			data.items.add(new File(["two!"], "two.txt", { type: "text/plain" }));
			return data;
		});
		await local.dispatchEvent("dragover", { dataTransfer: transfer });
		await expect(local.locator(".drop")).toHaveClass(/on/);
		await local.dispatchEvent("drop", { dataTransfer: transfer });
		await expect(
			local.getByRole("checkbox", { name: "one.txt" }),
		).toBeChecked();
		await expect(
			local.getByRole("checkbox", { name: "two.txt" }),
		).toBeChecked();
		await expect(local.locator(".ft")).toContainText("2 selected · 7 B");
	});
});
