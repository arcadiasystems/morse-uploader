import { describe, expect, it } from "vitest";
import { clamp } from "./clamp.js";

describe("clamp", () => {
	it("clamps below the min", () => {
		expect(clamp(0, 1, 10)).toBe(1);
	});
	it("clamps above the max", () => {
		expect(clamp(20, 1, 10)).toBe(10);
	});
	it("passes a value already in range", () => {
		expect(clamp(5, 1, 10)).toBe(5);
	});
});
