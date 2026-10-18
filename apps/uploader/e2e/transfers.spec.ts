import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Keypair } from "@mysten/sui/cryptography";
import { expect, type Page, test } from "@playwright/test";
import { connect } from "./app-actions";
import { ownedBlobs, walCoinType } from "./chain";
import { installTestWallet, KEY_ENV, keypairFromEnv } from "./test-wallet";
import {
	chainBlob,
	countSubmissions,
	expectWalSpent,
	keepShot,
	openSetting,
	openTransfers,
	overflow,
	predictedWal,
	signAndSend,
	spendTracker,
	stageFiles,
	stageFolder,
	stagingTray,
	transferRow,
	waitForDone,
} from "./upload-actions";

/**
 * The transfers slide-over on Testnet with the funded test wallet: a batch
 * held by Pause all and certified in one transaction, an automatic retry
 * of a relay upload that fails with its countdown and Retry now, and a
 * certify failure after the upload followed by Finish. Network faults are
 * made by Playwright in the test process (a route aborts the request); the
 * app sees a real failed request. Every upload is a few bytes for one
 * epoch; nothing is deleted.
 */
const funded = keypairFromEnv();
const NETWORK = "testnet";
/** Written into every file, so each run makes new blob ids. */
const RUN = `run ${Date.now().toString(36)}\n`;
const EXECUTE = "**/sui.rpc.v2.TransactionExecutionService/ExecuteTransaction";
/** The relay's upload endpoint, one POST per blob (PROTOCOL-NOTES section 6). */
const RELAY_UPLOAD = (url: URL) => url.pathname === "/v1/blob-upload-relay";

test.describe("transfers on Testnet", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the transfers tests.`);
	test.describe.configure({ mode: "serial", timeout: 300_000 });

	let page: Page;
	let owner: string;
	let wal: string;

	test.beforeAll(async ({ browser }) => {
		const keypair = funded as Keypair;
		owner = keypair.toSuiAddress();
		wal = await walCoinType(NETWORK);
		page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await installTestWallet(page, [keypair]);
		await page.goto("/app#files");
		await connect(page, owner);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test("holds a batch with Pause all, then certifies its two blobs in one transaction", async () => {
		const spend = await spendTracker(owner, wal);
		const submissions = await countSubmissions(page);
		const folder = await writeFolder(test.info().outputPath("pair"), {
			"first.txt": "First of two.\n",
			"second.txt": "Second of two.\n",
		});
		const tray = await stageFolder(page, folder);
		await openSetting(tray, "Folders");
		await tray.getByText("One blob per file", { exact: true }).click();
		const predicted = await predictedWal(tray, 1);
		// Two registers and one certify for the batch.
		await signAndSend(page, 3);

		const panel = await openTransfers(page);
		await panel.getByRole("button", { name: "Pause all" }).click();
		await expect(
			panel.getByRole("button", { name: "Resume all" }),
		).toHaveAttribute("aria-pressed", "true");
		// The step under way finishes; then nothing runs and nothing is signed.
		await expect(panel.locator("li.tx.running")).toHaveCount(0, {
			timeout: 90_000,
		});
		await expect(panel.locator(".sum dd").first()).toHaveText("paused");
		const held = submissions();
		await keepShot(page, "transfers-paused-1440");
		await page.waitForTimeout(5_000);
		expect(submissions()).toBe(held);
		await expect(panel.locator("li.tx.running")).toHaveCount(0);
		await expect(
			panel.locator("li.tx", { hasText: "paused" }).first(),
		).toBeVisible();

		await panel.getByRole("button", { name: "Resume all" }).click();
		const items = await waitForDone(page, [
			"pair/first.txt",
			"pair/second.txt",
		]);
		const blobs = await Promise.all(
			items.map((item) => chainBlob(owner, item.blobId)),
		);
		for (const blob of blobs) {
			expect(blob.certifiedEpoch).not.toBeNull();
			expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		}
		expect(blobs.map((blob) => blob.attributes.name).sort()).toEqual([
			"pair/first.txt",
			"pair/second.txt",
		]);
		// Exactly three transactions: the two registers and one certify.
		expect(submissions()).toBe(3);
		await expect(
			panel.locator(".sum div", { hasText: "Signatures" }),
		).toContainText("3 / 3");
		await expectWalSpent(spend, predicted);
		await page.unroute(EXECUTE);
	});

	test("retries a relay upload that failed, counts down, and Retry now sends it", async () => {
		const spend = await spendTracker(owner, wal);
		const folder = await writeFolder(test.info().outputPath("retry"), {
			"one.txt": "Uploaded on the first try.\n",
			"two.txt": "Uploaded after two failures.\n",
		});
		// The relay requests of the second file fail twice: the queue retries
		// on its own after 2 s, then counts down 4 s to its last attempt.
		let relayRequests = 0;
		await page.route(RELAY_UPLOAD, (route) => {
			if (route.request().method() !== "POST") return route.continue();
			relayRequests += 1;
			return relayRequests === 2 || relayRequests === 3
				? route.abort("failed")
				: route.continue();
		});
		const tray = await stageFolder(page, folder);
		await openSetting(tray, "Folders");
		await tray.getByText("One blob per file", { exact: true }).click();
		const predicted = await predictedWal(tray, 1);
		await signAndSend(page, 3);

		const panel = await openTransfers(page);
		const second = transferRow(page, "retry/two.txt");
		await expect(second.locator(".where")).toHaveText(
			/^upload failed · retry 3 of 3 in [1-4] s$/,
			{ timeout: 120_000 },
		);
		await expect(second.locator(".steps > span").nth(2)).toHaveClass(
			"retrying",
		);
		// The first file is on the nodes and waits to be certified with the batch.
		await expect(transferRow(page, "retry/one.txt")).toContainText(
			"waiting for the batch",
		);
		await keepShot(page, "transfers-mixed-1440");
		await page.setViewportSize({ width: 390, height: 844 });
		await keepShot(page, "transfers-mixed-390");
		await page.setViewportSize({ width: 1440, height: 900 });
		await panel
			.getByRole("button", { name: "Retry retry/two.txt now" })
			.click();

		const items = await waitForDone(page, ["retry/one.txt", "retry/two.txt"]);
		expect(relayRequests).toBe(4);
		for (const item of items) {
			const blob = await chainBlob(owner, item.blobId);
			expect(blob.certifiedEpoch).not.toBeNull();
			expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		}
		await expectWalSpent(spend, predicted);
		await page.unroute(RELAY_UPLOAD);
	});

	test("offers Finish when certify fails after the upload, and Finish certifies", async () => {
		const spend = await spendTracker(owner, wal);
		// The second transaction the page submits, the certify, is dropped
		// before it leaves the browser, once.
		let submissions = 0;
		await page.route(EXECUTE, (route) => {
			submissions += 1;
			return submissions === 2 ? route.abort("failed") : route.continue();
		});
		await stageFiles(page, [
			file("finish-me.txt", "Certified by Finish.\n", "text/plain"),
		]);
		const predicted = await predictedWal(stagingTray(page), 1);
		await signAndSend(page, 2);

		const panel = await openTransfers(page);
		await panel.getByRole("tab", { name: /Failed/ }).click();
		const row = transferRow(page, "finish-me.txt");
		await expect(row.locator(".where")).toHaveText("certify failed", {
			timeout: 180_000,
		});
		await expect(row.locator(".steps > span").nth(3)).toHaveClass("failed");
		await expect(row).toContainText("Finish certifies it");
		const objectId = await row.locator(".detail code").getAttribute("title");
		expect(objectId).toMatch(/^0x[0-9a-f]{64}$/);
		const before = (await ownedBlobs(NETWORK, owner)).find(
			(blob) => blob.objectId === objectId,
		);
		expect(before?.certifiedEpoch).toBeNull();
		await keepShot(page, "transfers-failed-1440");

		await page.unroute(EXECUTE);
		await row.getByRole("button", { name: "Finish finish-me.txt" }).click();
		const [item] = await waitForDone(page, ["finish-me.txt"]);
		const blob = await chainBlob(owner, item?.blobId);
		expect(blob.objectId).toBe(objectId);
		expect(blob.certifiedEpoch).not.toBeNull();
		expect(blob.endEpoch).toBe(blob.startEpoch + 1);
		await expectWalSpent(spend, predicted);
	});

	test("fits 390 with the tray and the slide-over open over done transfers", async () => {
		await stageFiles(page, [
			file("staged-only.txt", "Never sent.\n", "text/plain"),
		]);
		await page.setViewportSize({ width: 390, height: 844 });
		const panel = await openTransfers(page);
		await panel.getByRole("tab", { name: /Done/ }).click();
		await expect(panel.locator("li.tx.done").first()).toBeVisible();
		expect(await overflow(page)).toEqual({ fits: true });
		await keepShot(page, "transfers-done-390");
		await page.keyboard.press("Escape");
		await expect(stagingTray(page)).toBeVisible();
		expect(await overflow(page)).toEqual({ fits: true });
		await stagingTray(page)
			.getByRole("button", { name: "Clear", exact: true })
			.click();
		await page.setViewportSize({ width: 1440, height: 900 });
	});
});

function file(name: string, text: string, mimeType: string) {
	return { name, mimeType, buffer: Buffer.from(text + RUN) };
}

async function writeFolder(
	root: string,
	files: Record<string, string>,
): Promise<string> {
	for (const [path, text] of Object.entries(files)) {
		const target = join(root, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, text + RUN);
	}
	return root;
}
