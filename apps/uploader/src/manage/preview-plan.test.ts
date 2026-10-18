import { describe, expect, it } from "vitest";
import {
	MAX_IMAGE_PREVIEW_BYTES,
	mediaTypeOf,
	previewPlan,
	TEXT_PREVIEW_BYTES,
} from "./preview-plan";

describe("mediaTypeOf", () => {
	it("prefers the stored type, without parameters", () => {
		expect(mediaTypeOf("Text/Plain; charset=utf-8", "x.png")).toBe(
			"text/plain",
		);
	});

	it("guesses from the extension when nothing is stored", () => {
		expect(mediaTypeOf(null, "hero.PNG")).toBe("image/png");
		expect(mediaTypeOf(null, "assets/a.txt")).toBe("text/plain");
		expect(mediaTypeOf(null, "archive.zip")).toBeNull();
		expect(mediaTypeOf(null, "README")).toBeNull();
	});
});

describe("previewPlan", () => {
	it("draws images up to the size limit", () => {
		expect(previewPlan("image/png", 1_200n)).toEqual({ kind: "image" });
		expect(previewPlan("image/png", null)).toEqual({ kind: "image" });
		expect(previewPlan("image/jpeg", MAX_IMAGE_PREVIEW_BYTES + 1n)).toEqual({
			kind: "too-large",
			limitBytes: MAX_IMAGE_PREVIEW_BYTES,
		});
	});

	it("reads only the start of text files", () => {
		expect(previewPlan("text/plain", 31n)).toEqual({
			kind: "text",
			readBytes: 31,
		});
		expect(previewPlan("application/json", 1_000_000n)).toEqual({
			kind: "text",
			readBytes: TEXT_PREVIEW_BYTES,
		});
		expect(previewPlan("text/html", null)).toEqual({
			kind: "text",
			readBytes: TEXT_PREVIEW_BYTES,
		});
	});

	it("previews nothing else", () => {
		expect(previewPlan("application/zip", 10n)).toEqual({
			kind: "none",
			mediaType: "application/zip",
		});
		expect(previewPlan(null, 10n)).toEqual({ kind: "none", mediaType: null });
	});
});
