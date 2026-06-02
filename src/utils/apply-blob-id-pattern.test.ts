import { describe, expect, it } from "vitest";
import { applyBlobIdPattern } from "./apply-blob-id-pattern.js";

describe("applyBlobIdPattern", () => {
	it("substitutes the :blobId token", () => {
		expect(applyBlobIdPattern("/f/:blobId", "abc")).toBe("/f/abc");
	});

	it("URL-encodes the blob id", () => {
		expect(applyBlobIdPattern("/f/:blobId", "a/b c")).toBe("/f/a%2Fb%20c");
	});

	it("leaves a pattern without the token unchanged", () => {
		expect(applyBlobIdPattern("/static", "abc")).toBe("/static");
	});
});
