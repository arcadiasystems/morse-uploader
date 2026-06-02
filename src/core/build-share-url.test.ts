import { afterEach, describe, expect, it, vi } from "vitest";
import { buildShareUrl } from "./build-share-url.js";

describe("buildShareUrl", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses appBaseUrl with the default pattern", () => {
		expect(
			buildShareUrl("abc", { appBaseUrl: "https://app.example.com" }),
		).toBe("https://app.example.com/f/abc");
	});

	it("honors a custom pattern", () => {
		const url = buildShareUrl("abc", {
			appBaseUrl: "https://app.example.com",
			pattern: "/files/:blobId/view",
		});
		expect(url).toBe("https://app.example.com/files/abc/view");
	});

	it("prefers appBaseUrl over the browser origin", () => {
		const url = buildShareUrl("abc", { appBaseUrl: "https://other.example" });
		expect(url).toBe("https://other.example/f/abc");
	});

	it("falls back to the browser origin when no appBaseUrl is given", () => {
		expect(buildShareUrl("abc")).toBe(`${window.location.origin}/f/abc`);
	});

	it("falls back to the aggregator URL outside a browser", () => {
		vi.stubGlobal("window", undefined);
		const url = buildShareUrl("abc", {
			aggregatorBaseUrl: "https://agg.example.com/",
		});
		expect(url).toBe("https://agg.example.com/v1/blobs/abc");
	});

	it("throws when no source can build a link", () => {
		vi.stubGlobal("window", undefined);
		expect(() => buildShareUrl("abc")).toThrow(/no appBaseUrl/);
	});
});
