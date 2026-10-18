import { describe, expect, it } from "vitest";
import {
	WalletPopupBlockedError,
	WalletRejectedError,
	walletRequestError,
} from "./wallet-executor";

describe("walletRequestError", () => {
	it("turns wallets' wordings of a decline into one error", () => {
		for (const message of [
			"User rejected the request",
			"Request denied by user",
			"The user declined to sign",
			"cancelled",
		])
			expect(walletRequestError(new Error(message))).toBeInstanceOf(
				WalletRejectedError,
			);
	});

	it("recognizes a web wallet window the browser blocked", () => {
		expect(
			walletRequestError(new Error("Failed to open new window")),
		).toBeInstanceOf(WalletPopupBlockedError);
	});

	it("passes any other failure through as it came", () => {
		const error = new TypeError("Failed to fetch");
		expect(walletRequestError(error)).toBe(error);
		expect(walletRequestError("text")).toBe("text");
	});
});
