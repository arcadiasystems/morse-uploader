import { describe, expect, it } from "vitest";
import { parseDecimalAmount } from "./parse-decimal-amount";

describe("parseDecimalAmount", () => {
	it("parses decimals into raw units", () => {
		expect(parseDecimalAmount("0.05", 9)).toBe(50_000_000n);
		expect(parseDecimalAmount("1", 9)).toBe(1_000_000_000n);
		expect(parseDecimalAmount(".5", 9)).toBe(500_000_000n);
		expect(parseDecimalAmount(" 0.000155232 ", 9)).toBe(155_232n);
		expect(parseDecimalAmount("0", 9)).toBe(0n);
	});

	it("refuses anything else", () => {
		for (const text of ["", ".", "-1", "1,000", "1e3", "abc", "0.0000000001"])
			expect(parseDecimalAmount(text, 9)).toBeNull();
	});
});
