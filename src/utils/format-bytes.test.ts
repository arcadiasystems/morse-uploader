import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes.js";

describe("formatBytes", () => {
	it("returns 0 B for zero", () => {
		expect(formatBytes(0)).toBe("0 B");
	});

	it("returns 0 B for negative or non-finite input", () => {
		expect(formatBytes(-1)).toBe("0 B");
		expect(formatBytes(Number.NaN)).toBe("0 B");
		expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
	});

	it("shows whole bytes without a fraction", () => {
		expect(formatBytes(512)).toBe("512 B");
	});

	it("formats kilobytes with two decimals by default", () => {
		expect(formatBytes(1024)).toBe("1.00 KB");
		expect(formatBytes(1536)).toBe("1.50 KB");
	});

	it("respects a custom fractionDigits", () => {
		expect(formatBytes(1536, 0)).toBe("2 KB");
	});

	it("scales into larger units", () => {
		expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
	});

	it("clamps to the largest known unit", () => {
		expect(formatBytes(1024 ** 7)).toContain("PB");
	});
});
