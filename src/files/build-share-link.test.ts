import { afterEach, describe, expect, it, vi } from "vitest";
import { buildShareLink } from "./build-share-link.js";
import { parseShareLink } from "./parse-share-link.js";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("buildShareLink / parseShareLink", () => {
	it("builds a fragment link with the fileId and hex seal material", () => {
		const link = buildShareLink({
			fileId: "0xfile",
			sealIdPrefix: new Uint8Array([1, 2, 255]),
			sealNonce: new Uint8Array([10, 20]),
			baseUrl: "https://app.test",
		});
		expect(link).toBe("https://app.test/#/f/0xfile?p=0102ff&n=0a14");
	});

	it("omits the seal material for a public file", () => {
		expect(
			buildShareLink({ fileId: "0xfile", baseUrl: "https://app.test" }),
		).toBe("https://app.test/#/f/0xfile");
	});

	it("uses the browser origin when no baseUrl is given", () => {
		vi.stubGlobal("window", { location: { origin: "https://demo.app" } });
		expect(buildShareLink({ fileId: "0xfile" })).toBe(
			"https://demo.app/#/f/0xfile",
		);
	});

	it("round-trips through parseShareLink", () => {
		const sealIdPrefix = new Uint8Array([9, 8, 7]);
		const sealNonce = new Uint8Array([1, 1]);
		const link = buildShareLink({
			fileId: "0xabc",
			sealIdPrefix,
			sealNonce,
			baseUrl: "https://x.io",
		});
		const parsed = parseShareLink(link);
		expect(parsed?.fileId).toBe("0xabc");
		expect(parsed?.sealIdPrefix).toEqual(sealIdPrefix);
		expect(parsed?.sealNonce).toEqual(sealNonce);
	});

	it("parses a public link with no seal material", () => {
		const parsed = parseShareLink("https://x.io/#/f/0xpublic");
		expect(parsed).toEqual({
			fileId: "0xpublic",
			sealIdPrefix: null,
			sealNonce: null,
		});
	});

	it("returns null for an unrelated fragment", () => {
		expect(parseShareLink("https://x.io/#/about")).toBeNull();
	});
});
