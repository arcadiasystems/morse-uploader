import { describe, expect, it } from "vitest";
import { formatTokenAmount } from "./format-token-amount.js";

describe("formatTokenAmount", () => {
	it("formats whole and fractional parts", () => {
		expect(formatTokenAmount(1_500_000_000n)).toBe("1.5000");
	});
	it("truncates to fractionDigits", () => {
		expect(formatTokenAmount(1_234_567_890n, 2)).toBe("1.23");
	});
	it("formats zero", () => {
		expect(formatTokenAmount(0n)).toBe("0.0000");
	});
	it("omits the fraction when fractionDigits is 0", () => {
		expect(formatTokenAmount(2_000_000_000n, 0)).toBe("2");
	});
	it("handles negative amounts", () => {
		expect(formatTokenAmount(-1_500_000_000n)).toBe("-1.5000");
	});
});
