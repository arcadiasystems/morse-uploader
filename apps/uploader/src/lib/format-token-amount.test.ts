import { describe, expect, it } from "vitest";
import { formatTokenAmount } from "./format-token-amount";

const WAL = 1_000_000_000n;
const compact = (raw: bigint | null) => formatTokenAmount(raw, 9, "compact");
const detailed = (raw: bigint | null) => formatTokenAmount(raw, 9, "detailed");

describe("formatTokenAmount", () => {
	it("shows a missing amount as missing and zero as 0", () => {
		expect(compact(null)).toEqual({ kind: "missing" });
		expect(compact(0n)).toEqual({ kind: "plain", text: "0" });
		expect(detailed(0n)).toEqual({ kind: "plain", text: "0" });
	});

	it("keeps 2 decimals from 1 up and 4 below 1 in compact, trimming zeros", () => {
		expect(compact(2_410_000_000n)).toEqual({ kind: "plain", text: "2.41" });
		expect(compact(1_900_000_000n)).toEqual({ kind: "plain", text: "1.9" });
		expect(compact(769_886_449n)).toEqual({ kind: "plain", text: "0.7699" });
		expect(compact(225_962_348n)).toEqual({ kind: "plain", text: "0.226" });
		expect(compact(80_000_000n)).toEqual({ kind: "plain", text: "0.08" });
	});

	it("rounds half away from zero", () => {
		expect(compact(1_005_000_000n)).toEqual({ kind: "plain", text: "1.01" });
		expect(compact(1_004_999_999n)).toEqual({ kind: "plain", text: "1" });
		expect(compact(999_995_000_000n)).toEqual({ kind: "plain", text: "1,000" });
	});

	it("abbreviates from 1,000 in compact, carrying into the next unit", () => {
		expect(compact(1_234n * WAL + 500_000_000n)).toEqual({
			kind: "plain",
			text: "1.2K",
		});
		expect(compact(10_000n * WAL)).toEqual({ kind: "plain", text: "10K" });
		expect(compact(999_950n * WAL)).toEqual({ kind: "plain", text: "1M" });
		expect(compact(1_500_000_000_000n * WAL)).toEqual({
			kind: "plain",
			text: "1.5T",
		});
		expect(compact(1_500_000_000_000_000n * WAL)).toEqual({
			kind: "plain",
			text: "1,500T",
		});
	});

	it("shows the exact value with grouping in detailed", () => {
		expect(detailed(225_962_348n)).toEqual({
			kind: "plain",
			text: "0.225962348",
		});
		expect(detailed(1_234n * WAL + 500_000_000n)).toEqual({
			kind: "plain",
			text: "1,234.5",
		});
		expect(detailed(5_006_072n)).toEqual({
			kind: "plain",
			text: "0.005006072",
		});
	});

	it("uses a zero-subscript from three leading zeros, 2 digits compact and 4 detailed", () => {
		// 0.000446607 WAL: the smallest Testnet upload at 2026-10-17 prices.
		expect(compact(446_607n)).toEqual({
			kind: "subscript",
			zeros: 3,
			digits: "45",
		});
		expect(detailed(446_607n)).toEqual({
			kind: "subscript",
			zeros: 3,
			digits: "4466",
		});
		expect(compact(2_364n)).toEqual({
			kind: "subscript",
			zeros: 5,
			digits: "24",
		});
		expect(compact(1n)).toEqual({ kind: "subscript", zeros: 8, digits: "1" });
	});

	it("leaves the subscript when rounding carries past three zeros", () => {
		expect(compact(999_999n)).toEqual({ kind: "plain", text: "0.001" });
	});

	it("rejects negative amounts", () => {
		expect(() => compact(-1n)).toThrow(RangeError);
	});
});
