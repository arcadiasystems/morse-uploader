import { describe, expect, it } from "vitest";
import { inBatches, signatureCount } from "./batches";

describe("inBatches", () => {
	it("splits items into batches of at most the size, in order", () => {
		expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("keeps a run that fits in one batch whole", () => {
		expect(inBatches(["a", "b"], 50)).toEqual([["a", "b"]]);
	});

	it("gives no batches for no items", () => {
		expect(inBatches([], 50)).toEqual([]);
	});

	it("refuses a batch size below one or not whole", () => {
		expect(() => inBatches([1], 0)).toThrow(RangeError);
		expect(() => inBatches([1], 1.5)).toThrow(RangeError);
	});
});

describe("signatureCount: one wallet prompt per transaction", () => {
	it("asks nothing for nothing", () => {
		expect(signatureCount(0, 25)).toBe(0);
	});

	it("asks once while one transaction holds everything", () => {
		expect(signatureCount(1, 25)).toBe(1);
		expect(signatureCount(25, 25)).toBe(1);
		expect(signatureCount(50, 50)).toBe(1);
	});

	it("asks once more for each started transaction", () => {
		expect(signatureCount(26, 25)).toBe(2);
		expect(signatureCount(51, 50)).toBe(2);
		expect(signatureCount(120, 50)).toBe(3);
	});

	it("refuses a transaction that holds nothing", () => {
		expect(() => signatureCount(3, 0)).toThrow(RangeError);
	});
});
