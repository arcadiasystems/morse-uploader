import { describe, expect, it } from "vitest";
import { failedTransactionMessage } from "./failed-transaction-message.js";

type Failed = Parameters<typeof failedTransactionMessage>[0];

describe("failedTransactionMessage", () => {
	it("includes the effects status error message", () => {
		const failed = {
			effects: { status: { error: { message: "MoveAbort(...)" } } },
		} as unknown as Failed;
		expect(failedTransactionMessage(failed)).toBe(
			"transaction failed: MoveAbort(...)",
		);
	});

	it("falls back when no status error is present", () => {
		const failed = { effects: {} } as unknown as Failed;
		expect(failedTransactionMessage(failed)).toBe(
			"transaction failed without effects status",
		);
	});
});
