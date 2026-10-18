import { describe, expect, it } from "vitest";
import { lastAtOrAbove } from "./use-visible-range";

describe("lastAtOrAbove", () => {
	const tops = [0, 50, 100, 136, 172];

	it("finds the last row starting at or above a position", () => {
		expect(lastAtOrAbove(tops, 0)).toBe(0);
		expect(lastAtOrAbove(tops, 49)).toBe(0);
		expect(lastAtOrAbove(tops, 50)).toBe(1);
		expect(lastAtOrAbove(tops, 140)).toBe(3);
		expect(lastAtOrAbove(tops, 10_000)).toBe(4);
	});

	it("clamps above the first row and handles an empty list", () => {
		expect(lastAtOrAbove(tops, -600)).toBe(0);
		expect(lastAtOrAbove([], 100)).toBe(0);
	});
});
