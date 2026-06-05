import { describe, expect, it } from "vitest";
import { isPreviewableImage } from "./is-previewable-image.js";

describe("isPreviewableImage", () => {
	it("accepts common image types, case-insensitively", () => {
		expect(isPreviewableImage("image/png")).toBe(true);
		expect(isPreviewableImage("IMAGE/JPEG")).toBe(true);
		expect(isPreviewableImage("image/svg+xml")).toBe(true);
	});

	it("rejects non-previewable types", () => {
		expect(isPreviewableImage("application/pdf")).toBe(false);
		expect(isPreviewableImage("image/tiff")).toBe(false);
		expect(isPreviewableImage("text/plain")).toBe(false);
	});
});
