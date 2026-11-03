import { describe, expect, it } from "vitest";
import { bytesEqual } from "./bytes-equal.js";

describe("bytesEqual", () => {
	it("is true for the same bytes", () => {
		expect(
			bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
		).toBe(true);
	});

	it("is true for two empty arrays", () => {
		expect(bytesEqual(new Uint8Array(), new Uint8Array())).toBe(true);
	});

	it("is false when one byte differs", () => {
		expect(
			bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])),
		).toBe(false);
	});

	it("is false when one is a prefix of the other", () => {
		expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(
			false,
		);
	});
});
