import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Keypair } from "@mysten/sui/cryptography";
import { expect, type Page, test } from "@playwright/test";
import { connect, openProfileMenu, profileTrigger, short } from "./app-actions";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";
import {
	keepShot,
	openSetting,
	openTransfers,
	overflow,
	stagingTray,
	trayItem,
} from "./upload-actions";

/**
 * Drop anywhere and the staging tray, with the funded test wallet
 * connected. Nothing here signs: files are staged, priced from chain,
 * reloaded and cleared.
 */
const funded = keypairFromEnv();

const SITE = {
	"index.html": "<h1>Staged</h1>\n",
	"about.txt": "About the staged site.\n",
	"assets/a.txt": "An asset.\n",
};

test.describe("drop anywhere and the staging tray", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the staging tests.`);
	test.describe.configure({ mode: "serial", timeout: 180_000 });

	let page: Page;
	let owner: string;
	let site: string;

	test.beforeAll(async ({ browser }, info) => {
		const keypair = funded as Keypair;
		owner = keypair.toSuiAddress();
		site = await writeFolder(
			join(info.project.outputDir, "staging", "site"),
			SITE,
		);
		page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await installTestWallet(page, [keypair]);
		await page.goto("/app#files");
		await connect(page, owner);
		await page.keyboard.press("Escape");
		await expect(
			page.locator('table.tbl tbody tr[aria-level="1"]').first(),
		).toBeVisible({ timeout: 90_000 });
	});

	test.afterAll(async () => {
		await page.close();
	});

	test("drops a folder and files anywhere and stages them with their paths", async () => {
		// A real folder from disk, dragged in through the DevTools protocol, so
		// the browser walks it with the File and Directory Entries API.
		const cdp = await page.context().newCDPSession(page);
		const drag = (type: "dragEnter" | "dragOver" | "drop") =>
			cdp.send("Input.dispatchDragEvent", {
				type,
				x: 700,
				y: 450,
				data: { items: [], files: [site], dragOperationsMask: 1 },
			});
		await drag("dragEnter");
		await drag("dragOver");
		const overlay = page.locator("[data-drop-overlay]");
		await expect(overlay).toBeVisible();
		await expect(overlay).toContainText("Drop to stage");
		// A held drag keeps sending dragover; one more keeps the state up for the shot.
		await drag("dragOver");
		await keepShot(page, "drop-1440");
		await drag("drop");
		await expect(overlay).toBeHidden();

		// Loose files in a DataTransfer built in the page, dropped on the window.
		await page.evaluate(() => {
			const transfer = new DataTransfer();
			transfer.items.add(
				new File(["# Notes\n"], "notes.md", { type: "text/markdown" }),
			);
			transfer.items.add(
				new File([new Uint8Array([137, 80, 78, 71])], "hero.png", {
					type: "image/png",
				}),
			);
			for (const type of ["dragenter", "dragover", "drop"])
				document.body.dispatchEvent(
					new DragEvent(type, {
						dataTransfer: transfer,
						bubbles: true,
						cancelable: true,
					}),
				);
		});

		const tray = stagingTray(page);
		await expect(tray).toBeVisible();
		await expect(tray.locator("li[data-staged]")).toHaveCount(3);
		await expect(trayItem(tray, "site/")).toContainText(
			"3 files → 1 quilt, paths kept",
		);
		await expect(trayItem(tray, "notes.md")).toContainText("1 blob");
		await expect(trayItem(tray, "hero.png")).toContainText("1 blob");
		await tray.getByRole("button", { name: "site/", exact: true }).click();
		await expect(
			tray.getByRole("list", { name: "Files in site" }).locator(".path"),
		).toHaveText(["about.txt", "assets/a.txt", "index.html"]);
		// Three items: three registers and one certify for the batch.
		await expect(
			tray.getByRole("button", { name: "Sign and send · 4 signatures" }),
		).toBeEnabled({ timeout: 60_000 });
		await expect(tray).toHaveAttribute("data-saved", "true");
		await keepShot(page, "tray-1440");
	});

	test("comes back after a reload, kept per wallet and network", async () => {
		const tray = stagingTray(page);
		await openSetting(tray, "Folders");
		await tray.getByText("One blob per file", { exact: true }).click();
		await expect(trayItem(tray, "site/")).toContainText("3 files → 3 blobs");
		await expect(tray).toHaveAttribute("data-saved", "true");

		await page.reload();
		// The wallet remembers this site, so the app reconnects on its own.
		await expect(profileTrigger(page)).toContainText(short(owner));
		await expect(tray).toBeVisible({ timeout: 30_000 });
		await expect(tray.locator("li[data-staged]")).toHaveCount(3);
		await expect(trayItem(tray, "site/")).toContainText("3 files → 3 blobs");
		await expect(tray.getByText(/Not kept after the reload/)).toHaveCount(0);
		await tray.getByRole("button", { name: "site/", exact: true }).click();
		await expect(
			tray.getByRole("list", { name: "Files in site" }).locator(".path"),
		).toHaveText(["about.txt", "assets/a.txt", "index.html"]);
		// The bytes came back too: five blobs, five registers and one certify.
		await expect(
			tray.getByRole("button", { name: "Sign and send · 6 signatures" }),
		).toBeEnabled({ timeout: 60_000 });

		// One record per wallet and network in IndexedDB.
		expect(Object.keys(await savedTrays(page))).toEqual([`testnet:${owner}`]);

		// Walrus Mainnet has its own tray, empty; Testnet's comes back.
		const menu = await openProfileMenu(page);
		await menu.getByRole("radio", { name: "Walrus Mainnet" }).check();
		await expect(tray).toBeHidden();
		await menu.getByRole("radio", { name: "Testnet" }).check();
		await page.keyboard.press("Escape");
		await expect(tray).toBeVisible();
		await expect(tray.locator("li[data-staged]")).toHaveCount(3);
	});

	test("fits 390 with the tray and the slide-over open", async () => {
		await page.setViewportSize({ width: 390, height: 844 });
		const tray = stagingTray(page);
		await expect(
			tray.getByRole("button", { name: /^Sign and send · \d+ signatures$/ }),
		).toBeEnabled({ timeout: 60_000 });
		expect((await tray.boundingBox())?.width).toBe(390 - 24);
		expect(await overflow(page)).toEqual({ fits: true });
		await keepShot(page, "tray-390");

		const cdp = await page.context().newCDPSession(page);
		for (const type of ["dragEnter", "dragOver"] as const)
			await cdp.send("Input.dispatchDragEvent", {
				type,
				x: 195,
				y: 400,
				data: { items: [], files: [site], dragOperationsMask: 1 },
			});
		const overlay = page.locator("[data-drop-overlay]");
		await expect(overlay).toBeVisible();
		await keepShot(page, "drop-390");
		expect(await overflow(page)).toEqual({ fits: true });
		// The drag goes without a dragleave (a cancelled drag): once dragover
		// stops arriving, the drop state clears on its own.
		await expect(overlay).toBeHidden({ timeout: 5_000 });

		await openTransfers(page);
		expect(await overflow(page)).toEqual({ fits: true });
		await page.keyboard.press("Escape");
		await page.setViewportSize({ width: 1440, height: 900 });
	});

	test("removes an item, and Clear empties the tray for good", async () => {
		const tray = stagingTray(page);
		await tray.getByRole("button", { name: "Remove notes.md" }).click();
		await expect(tray.locator("li[data-staged]")).toHaveCount(2);
		await tray.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(tray).toBeHidden();
		// The emptied tray is saved a moment later; then a reload keeps it empty.
		await expect
			.poll(async () => (await savedTrays(page))[`testnet:${owner}`])
			.toEqual([]);
		await page.reload();
		await expect(profileTrigger(page)).toContainText(short(owner));
		await expect(
			page.locator('table.tbl tbody tr[aria-level="1"]').first(),
		).toBeVisible({ timeout: 90_000 });
		await expect(tray).toBeHidden();
	});
});

/** Each saved tray's root names by key, read straight from IndexedDB in the page. */
function savedTrays(page: Page): Promise<Record<string, string[]>> {
	return page.evaluate(
		() =>
			new Promise<Record<string, string[]>>((resolve, reject) => {
				const open = indexedDB.open("morse-uploader-staging");
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const all = open.result
						.transaction("trays")
						.objectStore("trays")
						.getAll();
					all.onerror = () => reject(all.error);
					all.onsuccess = () => {
						open.result.close();
						const records = all.result as {
							key: string;
							roots: { name: string }[];
						}[];
						resolve(
							Object.fromEntries(
								records.map((record) => [
									record.key,
									record.roots.map((root) => root.name),
								]),
							),
						);
					};
				};
			}),
	);
}

async function writeFolder(
	root: string,
	files: Record<string, string>,
): Promise<string> {
	for (const [path, text] of Object.entries(files)) {
		const target = join(root, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, text);
	}
	return root;
}
