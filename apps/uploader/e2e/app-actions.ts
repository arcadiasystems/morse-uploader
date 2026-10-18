import { expect, type Locator, type Page } from "@playwright/test";
import { TEST_WALLET_NAME } from "./test-wallet";

/** An address as the app shortens it: `0x4ea7…4c75`. */
export function short(address: string): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function openProfileMenu(page: Page): Promise<Locator> {
	const menu = page.getByRole("dialog", {
		name: "Profiles, network and wallet",
	});
	if (!(await menu.isVisible())) await page.locator(".topbar .profile").click();
	await expect(menu).toBeVisible();
	return menu;
}

/** Connects the test wallet from the profile menu and waits for the account to show. */
export async function connect(page: Page, address: string): Promise<void> {
	const menu = await openProfileMenu(page);
	await menu
		.getByRole("button", { name: new RegExp(TEST_WALLET_NAME) })
		.click();
	await expect(page.locator(".topbar .profile")).toContainText(short(address));
}
