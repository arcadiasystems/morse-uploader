import { expect, type Page, test } from "@playwright/test";
import { connect } from "./app-actions";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";

const funded = keypairFromEnv();
const PHONE = { width: 390, height: 844 };

/**
 * Nothing runs past the right edge at 390: the page does not scroll
 * sideways, the scrolling view has no hidden overflow either, and no
 * visible element of the app, its menus or its sheets ends past the
 * viewport. `.app` clips its content, so the page check alone could pass
 * while something is cut off; the element check catches that. The
 * background glows are decoration placed past the edges on purpose.
 */
async function expectNoOverflow(page: Page, where: string): Promise<void> {
	// Sheets and menus slide or fade in; measure where they come to rest.
	await page.waitForTimeout(400);
	const report = await page.evaluate(() => {
		const width = window.innerWidth;
		const view = document.querySelector<HTMLElement>(".view");
		const past = [
			...document.querySelectorAll<HTMLElement>(
				".app *, .tpanel *, .rmenu *, .scrim *",
			),
		]
			.filter((element) => {
				const box = element.getBoundingClientRect();
				const style = getComputedStyle(element);
				return (
					box.width > 0 &&
					box.height > 0 &&
					style.visibility !== "hidden" &&
					!element.closest(".sr-only") &&
					box.right > width + 0.5
				);
			})
			.map(
				(element) => `${element.tagName.toLowerCase()}.${element.className}`,
			);
		return {
			page: document.documentElement.scrollWidth - width,
			view: view ? view.scrollWidth - view.clientWidth : 0,
			past: past.slice(0, 5),
		};
	});
	expect(report, where).toEqual({ page: 0, view: 0, past: [] });
}

test.describe("phones, without a wallet", () => {
	test.use({ viewport: PHONE });

	for (const route of ["/", "/app", "/app#overview", "/app#files"]) {
		test(`${route} fits 390`, async ({ page }) => {
			await page.goto(route);
			await expect(page.locator("body")).toBeVisible();
			await expectNoOverflow(page, route);
		});
	}

	test("the rail is a tab bar along the bottom", async ({ page }) => {
		await page.goto("/app");
		const bar = page.getByRole("navigation", { name: "Views" });
		const box = await bar.boundingBox();
		expect(box?.width).toBe(PHONE.width);
		expect((box?.y ?? 0) + (box?.height ?? 0)).toBe(PHONE.height);
		for (const label of ["Overview", "Files", "Expiry", "Shared", "Morse"])
			await expect(bar.getByRole("link", { name: label })).toBeVisible();
		await expect(bar.getByRole("button", { name: "More" })).toBeVisible();
		await expect(bar.locator("[data-profile-trigger]")).toBeVisible();
	});
});

test.describe("phones, with the test wallet", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the wallet tests.`);
	test.use({ viewport: PHONE });

	test.beforeEach(async ({ page }) => {
		if (!funded) return;
		await installTestWallet(page, [funded]);
		await page.goto("/app#files");
		await connect(page, funded.toSuiAddress());
		await page.keyboard.press("Escape");
		await expect(page.locator('tbody tr[aria-level="1"]').first()).toBeVisible({
			timeout: 60_000,
		});
	});

	test("every route fits 390 with real rows", async ({ page }) => {
		for (const hash of [
			"#overview",
			"#files",
			"#files/quilts",
			"#files/encrypted",
			"#files/expiring",
			"#files/published",
			"#files/shared",
		]) {
			await page.evaluate((next) => {
				window.location.hash = next;
			}, hash);
			// The Overview's reads and the filter's rows settle before measuring.
			await page.waitForTimeout(hash === "#overview" ? 4_000 : 1_000);
			await expectNoOverflow(page, hash);
		}
	});

	test("rows keep name, size and the menu; the grid fits too", async ({
		page,
	}) => {
		const row = page.locator('tbody tr[aria-level="1"]').first();
		await expect(row.locator("td.nm")).toBeVisible();
		await expect(row.locator("td.sz")).toBeVisible();
		await expect(row.locator("button.more")).toBeVisible();
		await expect(row.locator("td.dt")).toBeHidden();
		await expect(row.locator("td.life")).toBeHidden();
		await expect(row.locator("input.cb")).toBeHidden();
		await page.getByRole("button", { name: "Grid view" }).click();
		await expectNoOverflow(page, "grid");
	});

	test("details, the row menu, the transfers panel and the menus fit 390", async ({
		page,
	}) => {
		await page.locator('tbody tr[aria-level="1"] td.nm').first().click();
		const inspector = page.locator("aside.insp");
		await expect(inspector).toBeVisible();
		expect((await inspector.boundingBox())?.width).toBe(PHONE.width);
		await expectNoOverflow(page, "details");
		await page.getByRole("button", { name: "Close details" }).click();

		await page.locator('tbody tr[aria-level="1"] button.more').first().click();
		await expect(page.getByRole("menu")).toBeVisible();
		await expectNoOverflow(page, "row menu");
		await page.keyboard.press("Escape");

		await page
			.getByRole("navigation", { name: "Views" })
			.getByRole("button", { name: /^Transfers/ })
			.click();
		await expect(page.getByRole("dialog", { name: "Transfers" })).toBeVisible();
		await expectNoOverflow(page, "transfers");
		await page.keyboard.press("Escape");

		for (const [trigger, dialog] of [
			[page.getByRole("button", { name: "More" }), "More"],
			[page.locator("[data-profile-trigger]"), "Profiles, network and wallet"],
			[page.locator("button.net"), "Balances and top up"],
		] as const) {
			await trigger.click();
			await expect(page.getByRole("dialog", { name: dialog })).toBeVisible();
			await expectNoOverflow(page, dialog);
			await page.keyboard.press("Escape");
		}
	});

	test("the inspector, the bulk bar and the palette fit 390", async ({
		page,
	}) => {
		const fits = () =>
			page.evaluate(
				() => document.documentElement.scrollWidth === window.innerWidth,
			);
		const rows = page.locator('tbody tr[aria-level="1"]');

		// The inspector is a full sheet.
		await rows.first().locator("td.nm").click();
		const inspector = page.locator("aside.insp");
		await expect(inspector.locator("#insp-storage")).toBeVisible({
			timeout: 60_000,
		});
		expect((await inspector.boundingBox())?.width).toBe(PHONE.width);
		expect(await fits()).toBe(true);
		await inspector.getByRole("button", { name: "Close details" }).click();

		// Checkboxes are hidden on a phone: a row's menu starts the selection.
		await expect(rows.first().locator("input.cb")).toBeHidden();
		await rows.first().locator("button.more").click();
		await page.getByRole("menuitem", { name: "Select" }).click();
		await expect(rows.nth(1).locator("input.cb")).toBeVisible();
		await rows.nth(1).locator("input.cb").check();
		const bar = page.getByRole("toolbar", { name: "Selected blobs" });
		await expect(bar).toContainText("2 selected");
		const box = await bar.boundingBox();
		// The bar spans the width above the tab bar and scrolls sideways inside it.
		expect(box?.x).toBe(12);
		expect((box?.x ?? 0) + (box?.width ?? 0)).toBe(PHONE.width - 12);
		expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
			PHONE.height - 60,
		);
		expect(await fits()).toBe(true);

		// The palette opens from the top bar's search button.
		await page.getByRole("button", { name: "Search and commands" }).click();
		const palette = page.getByRole("dialog", { name: "Command palette" });
		await expect(palette).toBeVisible();
		await page.keyboard.type("extend");
		const paletteBox = await palette.boundingBox();
		expect(paletteBox?.x).toBe(12);
		expect((paletteBox?.x ?? 0) + (paletteBox?.width ?? 0)).toBe(
			PHONE.width - 12,
		);
		expect(await fits()).toBe(true);
		await page.keyboard.press("Escape");
		await expect(palette).toBeHidden();
	});
});
