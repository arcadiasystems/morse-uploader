import { describe, expect, it } from "vitest";
import { FileTooLargeError } from "./file-too-large-error.js";

const limit = { maxBytes: 42_327_820, maxTipMist: 10_000_000n };

describe("FileTooLargeError", () => {
	it("names the file's size, the limit and the tip cap", () => {
		const error = new FileTooLargeError({
			sizeBytes: 52_428_800,
			afterEncryption: false,
			limit,
		});
		expect(error.message).toBe(
			"This file is 50.00 MB (52,428,800 bytes), over the 40.37 MB (42,327,820 bytes) limit for one upload. The Walrus upload relay's tip grows with file size, and this app caps it at 10,000,000 MIST.",
		);
		expect(error.name).toBe("FileTooLargeError");
		expect(error.sizeBytes).toBe(52_428_800);
		expect(error.afterEncryption).toBe(false);
		expect(error.limit).toBe(limit);
	});

	it("says when Seal's envelope took the file over", () => {
		const error = new FileTooLargeError({
			sizeBytes: 42_327_821,
			afterEncryption: true,
			limit,
		});
		expect(error.message).toMatch(
			/^Encrypted, this file is 40\.37 MB \(42,327,821 bytes\), over the 40\.37 MB \(42,327,820 bytes\) limit/,
		);
		expect(error.afterEncryption).toBe(true);
	});
});
