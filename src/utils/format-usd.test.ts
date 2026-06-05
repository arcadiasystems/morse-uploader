import { describe, expect, it } from "vitest";
import { formatUsd } from "./format-usd.js";

describe("formatUsd", () => {
	it("uses two decimals for cents and above", () => {
		expect(formatUsd(1.5)).toBe("$1.50");
		expect(formatUsd(0.01)).toBe("$0.01");
	});

	it("shows two significant digits for sub-cent amounts, no exponent", () => {
		expect(formatUsd(0.0023)).toBe("$0.0023");
		expect(formatUsd(0.0000074)).toBe("$0.0000074");
	});

	it("floors microscopic amounts instead of using scientific notation", () => {
		// ~7.4e-8 would render as "$7.4e-8"; show a readable floor instead.
		expect(formatUsd(0.000000074)).toBe("< $0.000001");
	});

	it("renders zero (or less) with two decimals", () => {
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(-1)).toBe("$0.00");
	});
});
