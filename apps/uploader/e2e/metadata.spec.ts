import { expect, type Page, test } from "@playwright/test";

const SITE_URL = "https://uploader.morsecms.xyz";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function metaContent(page: Page, selector: string): Promise<string> {
	const content = await page.locator(selector).getAttribute("content");
	if (content === null) throw new Error(`No content on ${selector}`);
	return content;
}

/** Width and height from a PNG's IHDR chunk, after checking the signature. */
function pngSize(bytes: Buffer): { width: number; height: number } {
	expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const PAGES = [
	{
		path: "/",
		// Next writes the root without a trailing slash.
		canonical: SITE_URL,
		title: "Morse Uploader, a transfer client for Walrus",
	},
	{
		path: "/app",
		canonical: `${SITE_URL}/app`,
		title: "Overview and files · Morse Uploader",
	},
];

test.describe("link previews and icons", () => {
	for (const { path, canonical, title } of PAGES) {
		test(`${path} carries its canonical URL and a large-image preview`, async ({
			page,
		}) => {
			await page.goto(path);
			await expect(page).toHaveTitle(title);
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
				"href",
				canonical,
			);
			const description = await metaContent(page, 'meta[name="description"]');

			expect(await metaContent(page, 'meta[property="og:type"]')).toBe(
				"website",
			);
			expect(await metaContent(page, 'meta[property="og:site_name"]')).toBe(
				"Morse Uploader",
			);
			expect(await metaContent(page, 'meta[property="og:url"]')).toBe(
				canonical,
			);
			expect(await metaContent(page, 'meta[property="og:title"]')).toBe(title);
			expect(await metaContent(page, 'meta[property="og:description"]')).toBe(
				description,
			);
			expect(await metaContent(page, 'meta[property="og:image"]')).toBe(
				`${SITE_URL}/og.png`,
			);
			expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe(
				"1200",
			);
			expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe(
				"630",
			);
			expect(
				await metaContent(page, 'meta[property="og:image:alt"]'),
			).toContain("Move data to Walrus. Keep every key.");

			expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe(
				"summary_large_image",
			);
			expect(await metaContent(page, 'meta[name="twitter:title"]')).toBe(title);
			expect(await metaContent(page, 'meta[name="twitter:image"]')).toBe(
				`${SITE_URL}/og.png`,
			);
		});
	}

	test("the share image is a 1200×630 PNG", async ({ request }) => {
		const response = await request.get("/og.png");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/png");
		expect(pngSize(await response.body())).toEqual({
			width: 1200,
			height: 630,
		});
	});

	test("the page links one icon set and every file in it is served", async ({
		page,
		request,
	}) => {
		await page.goto("/");
		const icons = page.locator('link[rel="icon"]');
		await expect(icons).toHaveCount(2);
		await expect(icons.nth(0)).toHaveAttribute("href", "/favicon.ico");
		await expect(icons.nth(1)).toHaveAttribute("href", "/icon.svg");
		await expect(icons.nth(1)).toHaveAttribute("type", "image/svg+xml");
		await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
			"href",
			"/apple-touch-icon.png",
		);

		const favicon = await request.get("/favicon.ico");
		expect(favicon.status()).toBe(200);
		expect(favicon.headers()["content-type"]).toBe("image/x-icon");
		const ico = await favicon.body();
		// The ICONDIR header: reserved 0, type 1 (icon), three images.
		expect([
			ico.readUInt16LE(0),
			ico.readUInt16LE(2),
			ico.readUInt16LE(4),
		]).toEqual([0, 1, 3]);

		const svg = await request.get("/icon.svg");
		expect(svg.status()).toBe(200);
		expect(svg.headers()["content-type"]).toBe("image/svg+xml");
		expect(await svg.text()).toContain('fill="#2B3BE0"');

		const apple = await request.get("/apple-touch-icon.png");
		expect(apple.status()).toBe(200);
		expect(pngSize(await apple.body())).toEqual({ width: 180, height: 180 });
	});

	test("the manifest opens the app and its icons are the sizes it states", async ({
		page,
		request,
	}) => {
		await page.goto("/");
		await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
			"href",
			"/manifest.webmanifest",
		);
		const response = await request.get("/manifest.webmanifest");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toBe(
			"application/manifest+json",
		);
		const manifest: {
			name: string;
			start_url: string;
			icons: { src: string; sizes: string; purpose?: string }[];
		} = await response.json();
		expect(manifest.name).toBe("Morse Uploader");
		expect(manifest.start_url).toBe("/app");
		expect(manifest.icons.map(({ src, purpose }) => [src, purpose])).toEqual([
			["/icon-192.png", undefined],
			["/icon-512.png", undefined],
			["/icon-maskable-512.png", "maskable"],
		]);
		for (const { src, sizes } of manifest.icons) {
			const icon = await request.get(src);
			expect(icon.status()).toBe(200);
			const { width, height } = pngSize(await icon.body());
			expect(`${width}x${height}`).toBe(sizes);
		}
	});
});
