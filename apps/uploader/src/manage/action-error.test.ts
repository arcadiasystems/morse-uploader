import { NotEnoughBlobConfirmationsError } from "@mysten/walrus";
import { describe, expect, it } from "vitest";
import {
	TransactionUnconfirmedError,
	WalletRejectedError,
} from "@/transfers/wallet-executor";
import { describeActionError } from "./action-error";

describe("describeActionError", () => {
	it("says the wallet declined", () => {
		expect(describeActionError(new WalletRejectedError())).toBe(
			"You declined the request in your wallet.",
		);
	});

	it("names the token the wallet is short of", () => {
		expect(
			describeActionError(
				new Error(
					"Insufficient balance of 0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL for owner 0x4ea7",
				),
			),
		).toMatch(/enough WAL/);
		expect(describeActionError(new Error("InsufficientGas"))).toMatch(
			/enough SUI/,
		);
	});

	it("explains storage node failures and unconfirmed transactions", () => {
		expect(
			describeActionError(new NotEnoughBlobConfirmationsError("few")),
		).toMatch(/storage nodes/);
		expect(describeActionError(new TransactionUnconfirmedError("AbC"))).toMatch(
			/Refresh to see whether it went through/,
		);
	});

	it("passes anything else through", () => {
		expect(describeActionError(new Error("MoveAbort in extend_blob"))).toBe(
			"MoveAbort in extend_blob",
		);
	});
});
