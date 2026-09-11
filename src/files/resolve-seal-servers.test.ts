import { describe, expect, it } from "vitest";
import { resolveSealServers } from "./resolve-seal-servers.js";

const A = [{ objectId: "0xa", weight: 1 }];
const B = [{ objectId: "0xb", weight: 1 }];

describe("resolveSealServers", () => {
	it("uses the config's servers when the consumer supplies none", () => {
		// The testnet case: morseConfig pins an open allowlist.
		expect(resolveSealServers(undefined, A)).toBe(A);
	});

	it("is undefined when neither has any", () => {
		// The mainnet case: every operator is commercial, so nothing is pinned
		// and the caller must skip building the adapter entirely.
		expect(resolveSealServers(undefined, [])).toBeUndefined();
		expect(resolveSealServers([], [])).toBeUndefined();
	});

	it("prefers the consumer's servers over the config's", () => {
		// Lets someone point even testnet at their own operator.
		expect(resolveSealServers(B, A)).toBe(B);
	});

	it("falls back to the config when the consumer passes an empty list", () => {
		// An empty array is 'I did not configure this', not 'use nothing'.
		expect(resolveSealServers([], A)).toBe(A);
	});
});
