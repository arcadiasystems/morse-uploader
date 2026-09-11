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
			network: null,
			sealIdPrefix: null,
			sealNonce: null,
		});
	});

	it("carries the network and round-trips it", () => {
		const link = buildShareLink({
			fileId: "0xabc",
			network: "mainnet",
			baseUrl: "https://x.io",
		});
		expect(link).toBe("https://x.io/#/f/0xabc?net=mainnet");
		expect(parseShareLink(link)?.network).toBe("mainnet");
	});

	it("puts the network before the seal material", () => {
		const link = buildShareLink({
			fileId: "0xabc",
			network: "testnet",
			sealIdPrefix: new Uint8Array([1]),
			sealNonce: new Uint8Array([2]),
			baseUrl: "https://x.io",
		});
		expect(link).toBe("https://x.io/#/f/0xabc?net=testnet&p=01&n=02");
		const parsed = parseShareLink(link);
		expect(parsed?.network).toBe("testnet");
		expect(parsed?.sealIdPrefix).toEqual(new Uint8Array([1]));
	});

	it("reads an unknown network as null rather than rejecting the link", () => {
		const parsed = parseShareLink("https://x.io/#/f/0xabc?net=devnet");
		expect(parsed?.fileId).toBe("0xabc");
		expect(parsed?.network).toBeNull();
	});

	it("returns null for an unrelated fragment", () => {
		expect(parseShareLink("https://x.io/#/about")).toBeNull();
	});
});

describe("parseShareLink rejects damaged seal material", () => {
	it("returns null when only the prefix is present", () => {
		expect(parseShareLink("https://x.io/#/f/0xabc?p=0102")).toBeNull();
	});

	it("returns null when only the nonce is present", () => {
		expect(parseShareLink("https://x.io/#/f/0xabc?n=0304")).toBeNull();
	});

	it("returns null when the seal hex is not hex", () => {
		expect(parseShareLink("https://x.io/#/f/0xabc?p=zzzz&n=0304")).toBeNull();
	});

	it("returns null when the seal hex has an odd digit count", () => {
		expect(parseShareLink("https://x.io/#/f/0xabc?p=abc&n=0304")).toBeNull();
	});
});
