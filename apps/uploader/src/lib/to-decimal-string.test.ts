import { describe, expect, it } from "vitest";
import { toDecimalString } from "./to-decimal-string";

describe("toDecimalString", () => {
	it("renders exact decimals without grouping or trailing zeros", () => {
		expect(toDecimalString(225_962_348n, 9)).toBe("0.225962348");
		expect(toDecimalString(1_234_500_000_000n, 9)).toBe("1234.5");
		expect(toDecimalString(2_000_000_000n, 9)).toBe("2");
		expect(toDecimalString(0n, 9)).toBe("0");
		expect(toDecimalString(42n, 0)).toBe("42");
	});

	it("rejects negative amounts and invalid decimals", () => {
		expect(() => toDecimalString(-1n, 9)).toThrow(RangeError);
		expect(() => toDecimalString(1n, -1)).toThrow(RangeError);
		expect(() => toDecimalString(1n, 1.5)).toThrow(RangeError);
	});
});
