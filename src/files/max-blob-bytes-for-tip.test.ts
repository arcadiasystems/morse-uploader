import type { TipStrategy } from "@mysten/walrus";
import { describe, expect, it } from "vitest";
import { maxBlobBytesForTip } from "./max-blob-bytes-for-tip.js";

// The Walrus Mainnet relay's /v1/tip-config, as read on 2026-10-20.
const MAINNET_TIP: TipStrategy = { linear: { base: 0, perEncodedKib: 40 } };
// The Testnet relay's, read the same day.
const TESTNET_TIP: TipStrategy = { const: 105 };
const DEFAULT_MAX_TIP = 10_000_000n;

// The forward direction, written out from @mysten/walrus 1.2.37
// (encodedBlobLength for 1000 shards, then calculateUploadRelayTip), as an
// oracle the inverse is checked against.
function relayTip(strategy: TipStrategy, size: number): bigint {
	let symbols = Math.floor((Math.max(size, 1) - 1) / 222_778) + 1;
	if (symbols % 2 === 1) {
		symbols += 1;
	}
	const encoded = BigInt(64_032_000 + 1_001_000 * symbols);
	if ("const" in strategy) {
		return BigInt(strategy.const);
	}
	return (
		BigInt(strategy.linear.base) +
		BigInt(strategy.linear.perEncodedKib) * ((encoded + 1023n) / 1024n)
	);
}

describe("maxBlobBytesForTip", () => {
	it("allows 42,327,820 bytes under the default 10,000,000 MIST cap on Walrus Mainnet", () => {
		const limit = maxBlobBytesForTip(MAINNET_TIP, DEFAULT_MAX_TIP);
		expect(limit).toBe(42_327_820);
		expect(relayTip(MAINNET_TIP, 42_327_820)).toBe(9_930_560n);
		expect(relayTip(MAINNET_TIP, 42_327_821)).toBe(10_008_760n);
	});

	it("returns the largest size whose tip fits, for any cap", () => {
		for (const cap of [
			2_579_480n,
			2_657_680n,
			5_000_000n,
			DEFAULT_MAX_TIP,
			123_456_789n,
		]) {
			const limit = maxBlobBytesForTip(MAINNET_TIP, cap);
			if (limit === null || limit === 0) {
				throw new Error(`expected a size limit for a cap of ${cap}`);
			}
			expect(relayTip(MAINNET_TIP, limit)).toBeLessThanOrEqual(cap);
			expect(relayTip(MAINNET_TIP, limit + 1)).toBeGreaterThan(cap);
		}
	});

	it("counts a non-zero base against the cap", () => {
		const strategy: TipStrategy = {
			linear: { base: 1_000_000, perEncodedKib: 40 },
		};
		const limit = maxBlobBytesForTip(strategy, DEFAULT_MAX_TIP);
		expect(limit).toBe(36_981_148);
		expect(relayTip(strategy, 36_981_148)).toBeLessThanOrEqual(DEFAULT_MAX_TIP);
		expect(relayTip(strategy, 36_981_149)).toBeGreaterThan(DEFAULT_MAX_TIP);
	});

	it("accepts bigint tip parameters, as @mysten/walrus types them", () => {
		const strategy: TipStrategy = { linear: { base: 0n, perEncodedKib: 40n } };
		expect(maxBlobBytesForTip(strategy, DEFAULT_MAX_TIP)).toBe(42_327_820);
	});

	it("returns 0 when even the smallest blob's tip is over the cap", () => {
		// 2,579,480 MIST is the tip for any blob up to 445,556 bytes, empty included.
		expect(maxBlobBytesForTip(MAINNET_TIP, 2_579_480n)).toBe(445_556);
		expect(maxBlobBytesForTip(MAINNET_TIP, 2_579_479n)).toBe(0);
		// The cap the example used before 0.2.0.
		expect(maxBlobBytesForTip(MAINNET_TIP, 1_000_000n)).toBe(0);
	});

	it("returns 0 when the base alone is over the cap", () => {
		const strategy: TipStrategy = {
			linear: { base: 20_000_000, perEncodedKib: 40 },
		};
		expect(maxBlobBytesForTip(strategy, DEFAULT_MAX_TIP)).toBe(0);
	});

	it("sets no limit for a flat tip within the cap, as on Testnet", () => {
		expect(maxBlobBytesForTip(TESTNET_TIP, DEFAULT_MAX_TIP)).toBeNull();
		expect(maxBlobBytesForTip(TESTNET_TIP, 105n)).toBeNull();
	});

	it("returns 0 for a flat tip over the cap", () => {
		expect(maxBlobBytesForTip(TESTNET_TIP, 104n)).toBe(0);
	});

	it("treats a linear tip with no per-KiB rate as flat", () => {
		const strategy: TipStrategy = { linear: { base: 500, perEncodedKib: 0 } };
		expect(maxBlobBytesForTip(strategy, 500n)).toBeNull();
		expect(maxBlobBytesForTip(strategy, 499n)).toBe(0);
	});
});
