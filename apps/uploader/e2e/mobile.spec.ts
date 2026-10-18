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
		const drawer = page.locator("aside.drawer");
		await expect(drawer).toBeVisible();
		expect((await drawer.boundingBox())?.width).toBe(PHONE.width);
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
});
