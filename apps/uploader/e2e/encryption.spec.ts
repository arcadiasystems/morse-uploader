import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { connect, openProfileMenu } from "./app-actions";
import { installTestWallet } from "./test-wallet";
import {
	keepShot,
	openSetting,
	overflow,
	type StageFile,
	stageFiles,
	trayItem,
} from "./upload-actions";

/**
 * The tray's Encrypt switch on both networks. Nothing here signs or spends,
 * so the wallet is a key made for the run, with no funds: these tests need
 * no E2E_SUI_PRIVATE_KEY and run in CI. The encrypted upload itself is in
 * upload.spec.ts, with the funded wallet.
 */
const NOTE: StageFile = {
	name: "encrypt-check.txt",
	mimeType: "text/plain",
	buffer: Buffer.from("Staged to look at the Encrypt switch.\n"),
};

function encryptSwitch(tray: Locator): Locator {
	return tray.getByRole("switch", { name: "Encrypt with Seal" });
}

function encryptionTile(tray: Locator): Locator {
	return tray.locator("button.set").filter({ hasText: "Encryption" });
}

test.describe("the tray's Encrypt switch", () => {
	test.describe.configure({ mode: "serial", timeout: 180_000 });

	let page: Page;

	test.beforeAll(async ({ browser }) => {
		const keypair = Ed25519Keypair.generate();
		page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await installTestWallet(page, [keypair]);
		await page.goto("/app#files");
		await connect(page, keypair.toSuiAddress());
		await page.keyboard.press("Escape");
	});

	test.afterAll(async () => {
		await page.close();
	});

	test("on Testnet it turns on and marks the staged file as encrypted", async () => {
		const tray = await stageFiles(page, [NOTE]);
		await openSetting(tray, "Encryption");
		const encrypt = encryptSwitch(tray);
		await expect(encrypt).toBeEnabled();
		await expect(encrypt).not.toBeChecked();
		await expect(encrypt).toHaveAccessibleDescription(
			"Client-side. Only wallets you allow can decrypt. The blob id, file name and size stay public.",
		);
		await expect(trayItem(tray, NOTE.name)).toContainText("1 blob");

		await encrypt.check();
		await expect(trayItem(tray, NOTE.name)).toContainText("1 encrypted blob");
		await expect(encryptionTile(tray)).toContainText("Seal, per file");

		await encrypt.uncheck();
		await expect(trayItem(tray, NOTE.name)).not.toContainText("encrypted");
		await expect(encryptionTile(tray)).toContainText("Off");
		await tray.getByRole("button", { name: "Clear", exact: true }).click();
		await expect(tray).toBeHidden();
	});

	test("on Walrus Mainnet it is off, says why, and cannot be turned on", async () => {
		const menu = await openProfileMenu(page);
		await menu.getByRole("radio", { name: "Walrus Mainnet" }).check();
		await page.keyboard.press("Escape");

		const tray = await stageFiles(page, [NOTE]);
		await openSetting(tray, "Encryption");
		const encrypt = encryptSwitch(tray);
		await expect(encrypt).toBeDisabled();
		await expect(encrypt).not.toBeChecked();
		// The reason is on screen and is the switch's description.
		const reason =
			"Off on Walrus Mainnet. Every Seal key server on Walrus Mainnet is commercial and needs its own credential to decrypt. Morse Uploader holds none, so encrypting here would store files nobody could read back.";
		await expect(tray.getByText(reason)).toBeVisible();
		await expect(encrypt).toHaveAccessibleDescription(reason);

		// The keyboard reaches it after the last two tiles, so the reason is
		// read out; neither Space nor a click turns it on.
		await encryptionTile(tray).focus();
		for (let presses = 0; presses < 3; presses += 1)
			await page.keyboard.press("Tab");
		await expect(encrypt).toBeFocused();
		await page.keyboard.press("Space");
		await expect(encrypt).not.toBeChecked();
		await encrypt.click({ force: true });
		await expect(encrypt).not.toBeChecked();
		await expect(encryptionTile(tray)).toContainText("Off");
		await expect(trayItem(tray, NOTE.name)).toContainText("1 blob");
		await expect(trayItem(tray, NOTE.name)).not.toContainText("encrypted");
		await keepShot(page, "encrypt-mainnet-1440");

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(encrypt).toBeDisabled();
		await expect(tray.getByText(reason)).toBeVisible();
		expect(await overflow(page)).toEqual({ fits: true });
		await keepShot(page, "encrypt-mainnet-390");
		await page.setViewportSize({ width: 1440, height: 900 });
	});
});
