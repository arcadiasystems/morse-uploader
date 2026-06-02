import { describe, expect, it } from "vitest";
import { trimTrailingSlashes } from "./trim-trailing-slashes.js";

describe("trimTrailingSlashes", () => {
	it("removes a single trailing slash", () => {
		expect(trimTrailingSlashes("https://x.com/")).toBe("https://x.com");
	});

	it("removes multiple trailing slashes", () => {
		expect(trimTrailingSlashes("https://x.com///")).toBe("https://x.com");
	});

	it("leaves a value without a trailing slash unchanged", () => {
		expect(trimTrailingSlashes("https://x.com/a")).toBe("https://x.com/a");
	});

	it("does not touch internal slashes", () => {
		expect(trimTrailingSlashes("a/b/c")).toBe("a/b/c");
	});
});
