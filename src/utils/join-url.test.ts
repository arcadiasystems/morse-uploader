import { describe, expect, it } from "vitest";
import { joinUrl } from "./join-url.js";

describe("joinUrl", () => {
	it("inserts a slash when neither side has one", () => {
		expect(joinUrl("https://x.com", "f/abc")).toBe("https://x.com/f/abc");
	});

	it("collapses a double slash when both sides have one", () => {
		expect(joinUrl("https://x.com/", "/f/abc")).toBe("https://x.com/f/abc");
	});

	it("handles a trailing slash on the base only", () => {
		expect(joinUrl("https://x.com/", "f/abc")).toBe("https://x.com/f/abc");
	});

	it("handles a leading slash on the path only", () => {
		expect(joinUrl("https://x.com", "/f/abc")).toBe("https://x.com/f/abc");
	});
});
