import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
	it("shows small counts in bytes", () => {
		expect(formatBytes(0n)).toBe("0 B");
		expect(formatBytes(19n)).toBe("19 B");
		expect(formatBytes(999n)).toBe("999 B");
	});

	it("keeps one decimal below 10 and whole numbers above, in decimal units", () => {
		expect(formatBytes(1_000n)).toBe("1 KB");
		expect(formatBytes(2_414n)).toBe("2.4 KB");
		expect(formatBytes(9_949n)).toBe("9.9 KB");
		expect(formatBytes(9_960n)).toBe("10 KB");
		expect(formatBytes(445_556n)).toBe("446 KB");
		expect(formatBytes(2_300_000n)).toBe("2.3 MB");
		expect(formatBytes(1_900_000_000n)).toBe("1.9 GB");
	});

	it("moves to the next unit instead of showing 1000", () => {
		expect(formatBytes(999_600n)).toBe("1 MB");
		expect(formatBytes(999_499n)).toBe("999 KB");
	});

	it("handles the protocol's largest blob", () => {
		// 14,599,533,452 bytes (PROTOCOL-NOTES section 1).
		expect(formatBytes(14_599_533_452n)).toBe("15 GB");
	});

	it("rejects negative counts", () => {
		expect(() => formatBytes(-1n)).toThrow(RangeError);
	});
});
