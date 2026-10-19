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
	test("renders the hero, the app shot, four features and the two ways into Walrus", async ({
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

		await expect(
			page
				.getByRole("region", { name: "What Morse Uploader does" })
				.getByRole("heading", { level: 3 }),
		).toHaveText([
			"Nothing uploads by surprise",
			"Every blob shows its time left",
			"Folders stay folders",
			"Verify, share, publish",
		]);

		const ways = page.getByRole("region", {
			name: "Walrus Console and Morse Uploader",
		});
		await expect(ways.getByRole("heading", { level: 3 })).toHaveText([
			"A hosted drive on Walrus",
			"A client for your wallet",
		]);
		await expect(
			ways.getByRole("link", { name: "Read about Walrus Console" }),
		).toHaveAttribute("href", "https://docs.wal.app/docs/console/overview");
		await expect(
			ways.getByRole("link", { name: "Open Morse Uploader" }),
		).toHaveAttribute("href", "/app");
		await expect(
			ways.getByRole("link", { name: "storage epochs" }),
		).toHaveAttribute(
			"href",
			"https://docs.wal.app/docs/console/storage-epochs",
		);
		await expect(page.getByRole("table")).toHaveCount(0);
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
		// The hero and the uploader's card both open the app.
		const openApp = main.getByRole("link", { name: "Open Morse Uploader" });
		await expect(openApp).toHaveCount(2);
		for (const link of await openApp.all())
			await expect(link).toHaveAttribute("href", "/app");
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

	test("at 390 the two cards stack and each fits the screen", async ({
		page,
	}) => {
		await page.setViewportSize(PHONE);
		await page.goto("/");
		const cards = page
			.getByRole("region", { name: "Walrus Console and Morse Uploader" })
			.getByRole("article");
		await expect(cards).toHaveCount(2);
		const boxes = await Promise.all(
			(await cards.all()).map(async (card) => {
				const box = await card.boundingBox();
				if (!box) throw new Error("A card has no layout box");
				return box;
			}),
		);
		const [first, second] = boxes;
		if (!first || !second) throw new Error("Expected two cards");
		expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
		for (const box of boxes) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
		}
	});
});
