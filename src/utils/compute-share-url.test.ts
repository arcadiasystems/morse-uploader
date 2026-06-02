import { afterEach, describe, expect, it, vi } from "vitest";
import { computeShareUrl } from "./compute-share-url.js";

describe("computeShareUrl", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns a URL when a source is available", () => {
		expect(computeShareUrl("abc", { appBaseUrl: "https://app.test" })).toBe(
			"https://app.test/f/abc",
		);
	});

	it("returns null instead of throwing when no source is available", () => {
		vi.stubGlobal("window", undefined);
		expect(computeShareUrl("abc")).toBeNull();
	});
});
