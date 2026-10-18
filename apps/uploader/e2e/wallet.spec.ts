import type { Keypair } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import {
	verifyPersonalMessageSignature,
	verifyTransactionSignature,
} from "@mysten/sui/verify";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	balance,
	decimal,
	MAINNET_WAL_COIN_TYPE,
	type Network,
	SUI_COIN_TYPE,
	walCoinType,
} from "./chain";
import {
	installTestWallet,
	KEY_ENV,
	keypairFromEnv,
	TEST_WALLET_NAME,
	type TestWallet,
} from "./test-wallet";

const funded = keypairFromEnv();

function short(address: string): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** The exact amount a balance row shows, read from its accessible text. */
async function shownAmount(row: Locator): Promise<string> {
	return row.evaluate((element) => {
		const exact = element.querySelector(".sr-only")?.textContent;
		return (exact ?? element.textContent ?? "").replaceAll(",", "").trim();
	});
}

async function expectBalancesMatchChain(
	page: Page,
	network: Network,
	owner: string,
): Promise<void> {
	const wal =
		network === "mainnet" ? MAINNET_WAL_COIN_TYPE : await walCoinType(network);
	const panel = page.getByRole("dialog", { name: "Balances and top up" });
	if (!(await panel.isVisible())) await page.locator(".bal").click();
	await expect(async () => {
		await panel.getByRole("button", { name: "Refresh" }).click();
		await expect(panel.getByText(/Read from chain at/)).toBeVisible();
		const [walOnChain, suiOnChain] = await Promise.all([
			balance(network, owner, wal),
			balance(network, owner, SUI_COIN_TYPE),
		]);
		expect(
			await shownAmount(
				panel.locator(".amounts div", { hasText: "WAL" }).locator("dd"),
			),
		).toBe(decimal(walOnChain));
		expect(
			await shownAmount(
				panel.locator(".amounts div", { hasText: "SUI" }).locator("dd"),
			),
		).toBe(decimal(suiOnChain));
	}).toPass({ timeout: 45_000 });
}

async function openProfileMenu(page: Page): Promise<Locator> {
	const menu = page.getByRole("dialog", {
		name: "Profiles, network and wallet",
	});
	if (!(await menu.isVisible())) await page.locator(".topbar .profile").click();
	await expect(menu).toBeVisible();
	return menu;
}

async function connect(page: Page, address: string): Promise<void> {
	const menu = await openProfileMenu(page);
	await menu
		.getByRole("button", { name: new RegExp(TEST_WALLET_NAME) })
		.click();
	await expect(page.locator(".topbar .profile")).toContainText(short(address));
}

test.describe("wallet, balances and profiles", () => {
	test.skip(!funded, `Set ${KEY_ENV} to run the wallet tests.`);

	let wallet: TestWallet;
	let fundedKey: Keypair;
	let freshKey: Keypair;

	test.beforeEach(async ({ page }) => {
		if (!funded) return;
		fundedKey = funded;
		freshKey = new Ed25519Keypair();
		wallet = await installTestWallet(page, [fundedKey, freshKey]);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/app");
	});

	test("connects and shows balances equal to chain", async ({ page }) => {
		const address = fundedKey.toSuiAddress();
		await connect(page, address);
		await expect(
			page.getByRole("region", { name: "Walrus Testnet" }),
		).toContainText(short(address));
		await expectBalancesMatchChain(page, "testnet", address);
	});

	test("switching to Walrus Mainnet reads its balances and shows the low-funds state", async ({
		page,
	}) => {
		const address = fundedKey.toSuiAddress();
		await connect(page, address);
		const menu = await openProfileMenu(page);
		await menu.getByRole("radio", { name: "Walrus Mainnet" }).check();
		await expect(
			page.getByRole("region", { name: "Walrus Mainnet" }),
		).toBeVisible();
		await page.keyboard.press("Escape");

		await expectBalancesMatchChain(page, "mainnet", address);
		const [walOnChain, suiOnChain] = await Promise.all([
			balance("mainnet", address, MAINNET_WAL_COIN_TYPE),
			balance("mainnet", address, SUI_COIN_TYPE),
		]);
		// This account holds nothing on Walrus Mainnet, which is below any upload floor.
		expect(walOnChain).toBe(0n);
		expect(suiOnChain).toBe(0n);
		await expect(page.locator(".bal")).toHaveClass(/\blow\b/);
		await expect(page.locator(".bal")).toContainText("top up");
		const panel = page.getByRole("dialog", { name: "Balances and top up" });
		await expect(
			panel.getByText("Top up to upload on Walrus Mainnet"),
		).toBeVisible();
		await expect(
			panel.getByRole("link", { name: /WAL token page/ }),
		).toHaveAttribute("href", "https://walrus.xyz/wal-token/");
		// Walrus Mainnet has no faucet; only the official pages are offered.
		await expect(panel.locator('a[href*="faucet.sui.io"]')).toHaveCount(0);
	});

	test("profiles save, switch account and network without disconnecting, persist and remove", async ({
		page,
	}) => {
		const fundedAddress = fundedKey.toSuiAddress();
		const freshAddress = freshKey.toSuiAddress();
		await connect(page, fundedAddress);

		let menu = await openProfileMenu(page);
		await menu
			.getByRole("button", {
				name: "Save this wallet and network as a profile",
			})
			.click();
		const form = menu.getByRole("form", { name: "Add profile" });
		await form.getByLabel("Name").fill("Funded");
		await form.getByRole("button", { name: "Save profile" }).click();
		await expect(
			menu.getByRole("button", { name: /Funded/ }).first(),
		).toHaveAttribute("aria-current", "true");

		await menu.getByRole("button", { name: "Add profile" }).click();
		await form.getByLabel("Name").fill("Fresh");
		await form.getByLabel(/Account in/).selectOption(freshAddress);
		await form.getByRole("radio", { name: "Walrus Mainnet" }).check();
		await form.getByRole("button", { name: "Save profile" }).click();
		await expect(page.locator(".topbar .profile")).toContainText("Fresh");
		await expect(page.locator(".topbar .profile")).toContainText(
			short(freshAddress),
		);
		await expect(
			page.getByRole("region", { name: "Walrus Mainnet" }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expectBalancesMatchChain(page, "mainnet", freshAddress);
		await page.keyboard.press("Escape");

		menu = await openProfileMenu(page);
		await menu.getByRole("button", { name: /^Funded/ }).click();
		await expect(page.locator(".topbar .profile")).toContainText(
			short(fundedAddress),
		);
		await expect(
			page.getByRole("region", { name: "Walrus Testnet" }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		await expectBalancesMatchChain(page, "testnet", fundedAddress);
		expect(wallet.connects()).toBe(1);
		expect(wallet.disconnects()).toBe(0);

		await page.reload();
		await expect(page.locator(".topbar .profile")).toContainText("Funded");
		await expect(
			page.getByRole("region", { name: "Walrus Testnet" }),
		).toBeVisible();
		menu = await openProfileMenu(page);
		await menu.getByRole("button", { name: "Remove profile Fresh" }).click();
		await expect(
			menu.getByRole("button", { name: "Remove profile Fresh" }),
		).toHaveCount(0);
		await page.reload();
		menu = await openProfileMenu(page);
		await expect(
			menu.getByRole("button", { name: "Remove profile Funded" }),
		).toBeVisible();
		await expect(
			menu.getByRole("button", { name: "Remove profile Fresh" }),
		).toHaveCount(0);
	});

	test("the test wallet's signatures verify (harness check, nothing is executed)", async ({
		page,
	}) => {
		const address = fundedKey.toSuiAddress();
		const signed = await page.evaluate(async () => {
			type Features = Record<
				string,
				Record<string, (input: unknown) => Promise<unknown>>
			>;
			const testWallet = (
				window as unknown as Record<string, { features: Features }>
			).__morseE2eTestWallet;
			if (!testWallet) throw new Error("The test wallet is not registered.");
			const connect = testWallet.features["standard:connect"]?.connect;
			const result = (await connect?.({})) as {
				accounts: { address: string }[];
			};
			const account = result.accounts[0];
			const sign =
				testWallet.features["sui:signPersonalMessage"]?.signPersonalMessage;
			return sign?.({
				message: new TextEncoder().encode("morse-uploader e2e"),
				account,
			}) as Promise<{
				bytes: string;
				signature: string;
			}>;
		});
		const signer = await verifyPersonalMessageSignature(
			new TextEncoder().encode("morse-uploader e2e"),
			signed.signature,
			{ address },
		);
		expect(signer.toSuiAddress()).toBe(address);

		const transaction = new Transaction();
		transaction.setSender(address);
		transaction.transferObjects(
			[transaction.splitCoins(transaction.gas, [1])],
			address,
		);
		const json = await transaction.toJSON();
		const signedTransaction = await page.evaluate(async (transactionJson) => {
			type Features = Record<
				string,
				Record<string, (input: unknown) => Promise<unknown>>
			>;
			const testWallet = (
				window as unknown as Record<
					string,
					{ features: Features; accounts: unknown[] }
				>
			).__morseE2eTestWallet;
			const sign = testWallet?.features["sui:signTransaction"]?.signTransaction;
			return sign?.({
				transaction: { toJSON: async () => transactionJson },
				account: testWallet?.accounts[0],
				chain: "sui:testnet",
			}) as Promise<{ bytes: string; signature: string }>;
		}, json);
		const transactionSigner = await verifyTransactionSignature(
			Uint8Array.from(Buffer.from(signedTransaction.bytes, "base64")),
			signedTransaction.signature,
			{ address },
		);
		expect(transactionSigner.toSuiAddress()).toBe(address);
	});
});
