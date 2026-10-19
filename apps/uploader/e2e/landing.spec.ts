import { expect, type Page, test } from "@playwright/test";

const DOCS_URL = "https://docs.morsecms.xyz";
const REPOSITORY_URL = "https://github.com/arcadiasystems/morse-uploader";
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function horizontalOverflow(
	page: Page,
): Promise<{ scrollWidth: number; innerWidth: number }> {
	return page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth,
	}));
}

test.describe("landing page", () => {
	test("renders the hero, the app shot, four features and the Console comparison", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/");
		await expect(page).toHaveTitle(
			"Morse Uploader, a transfer client for Walrus",
		);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(
			"Move data to Walrus. Keep every key.",
			{ useInnerText: true },
		);

		const shot = page.getByRole("img", { name: /Morse Uploader Overview/ });
		await expect(shot).toBeVisible();
		// The WebP decoded: a broken image would report no natural width.
		await expect
			.poll(() =>
				shot.evaluate((image: HTMLImageElement) => image.naturalWidth),
			)
			.toBeGreaterThan(0);

		await expect(page.getByRole("heading", { level: 3 })).toHaveText([
			"Nothing uploads by surprise",
			"Every blob shows its time left",
			"Folders stay folders",
			"Verify, share, publish",
		]);

		await expect(
			page.getByRole("heading", {
				level: 2,
				name: "Console is a hosted drive. Uploader is a client.",
			}),
		).toBeVisible();
		const table = page.getByRole("table", {
			name: "Walrus Console and Morse Uploader compared",
		});
		await expect(table.getByRole("columnheader")).toHaveText([
			"Walrus Console",
			"Morse Uploader",
		]);
		await expect(table.getByRole("rowheader")).toHaveText([
			"Login",
			"Keys and payment",
			"Limits",
			"Folders",
			"Expiry",
			"Verification",
			"Existing blobs",
		]);
		await expect(
			page.getByRole("link", { name: "storage epochs" }),
		).toHaveAttribute(
			"href",
			"https://docs.wal.app/docs/console/storage-epochs",
		);
	});

	test("the calls to action point to the app, the docs and the repository", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/");
		const nav = page.getByRole("navigation", { name: "Main" });
		await expect(
			nav.getByRole("link", { name: "Docs", exact: true }),
		).toHaveAttribute("href", DOCS_URL);
		await expect(nav.getByRole("link", { name: "GitHub" })).toHaveAttribute(
			"href",
			REPOSITORY_URL,
		);
		const main = page.getByRole("main");
		await expect(
			main.getByRole("link", { name: "Open Morse Uploader" }),
		).toHaveAttribute("href", "/app");
		await expect(
			main.getByRole("link", { name: "Read the docs" }),
		).toHaveAttribute("href", DOCS_URL);

		const open = nav.getByRole("link", { name: "Open in browser" });
		await expect(open).toHaveAttribute("href", "/app");
		await open.click();
		await expect(page).toHaveURL(/\/app$/);
		await expect(page.getByRole("region", { name: "Overview" })).toBeVisible();
	});

	test("on phones the bar keeps only the way into the app", async ({
		page,
	}) => {
		await page.setViewportSize(PHONE);
		await page.goto("/");
		const nav = page.getByRole("navigation", { name: "Main" });
		await expect(
			nav.getByRole("link", { name: "Open uploader" }),
		).toHaveAttribute("href", "/app");
		await expect(
			nav.getByRole("link", { name: "Docs", exact: true }),
		).toBeHidden();
		await expect(
			nav.getByRole("button", { name: /Download for Mac/ }),
		).toBeHidden();
	});

	test("Download for Mac is a disabled, dashed Coming button", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/");
		const download = page.getByRole("button", { name: /Download for Mac/ });
		await expect(download).toBeVisible();
		await expect(download).toBeDisabled();
		await expect(download).toContainText("Coming");
		await expect(download).toHaveCSS("border-top-style", "dashed");
	});

	test("keyboard focus starts at the mark and shows the ring", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP);
		await page.goto("/");
		await page.keyboard.press("Tab");
		const home = page.getByRole("link", { name: "Morse Uploader home" });
		await expect(home).toBeFocused();
		await expect(home).toHaveCSS("outline-style", "solid");
		await page.keyboard.press("Tab");
		await expect(
			page.getByRole("link", { name: "Docs", exact: true }),
		).toBeFocused();
	});

	for (const viewport of [PHONE, DESKTOP]) {
		test(`has no horizontal overflow at ${viewport.width}`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport);
			await page.goto("/");
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
			const { scrollWidth, innerWidth } = await horizontalOverflow(page);
			expect(scrollWidth).toBe(innerWidth);
		});
	}

	test("at 390 the comparison keeps its columns and scrolls inside its box", async ({
		page,
	}) => {
		await page.setViewportSize(PHONE);
		await page.goto("/");
		const scroller = page.locator(".cmp-scroll");
		const box = await scroller.evaluate((element) => ({
			scrollWidth: element.scrollWidth,
			clientWidth: element.clientWidth,
		}));
		expect(box.clientWidth).toBe(PHONE.width);
		expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
		const ours = page.getByRole("cell", { name: /Every Walrus blob/ });
		await ours.scrollIntoViewIfNeeded();
		await expect(ours).toBeInViewport();
	});
});
