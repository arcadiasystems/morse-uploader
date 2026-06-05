import { describe, expect, it } from "vitest";
import { uploadPhases } from "./upload-phases.js";

describe("uploadPhases", () => {
	it("includes the encrypting phase for encrypted uploads", () => {
		expect(uploadPhases(true)).toEqual([
			"encrypting",
			"uploading",
			"submitting",
			"complete",
		]);
	});

	it("skips the encrypting phase for public uploads", () => {
		expect(uploadPhases(false)).toEqual([
			"uploading",
			"submitting",
			"complete",
		]);
	});
});
