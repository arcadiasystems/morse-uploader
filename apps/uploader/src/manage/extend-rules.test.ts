import { describe, expect, it } from "vitest";
import { MAINNET_CLOCK, TESTNET_CLOCK } from "@/blobs/fixtures";
import { extendBlocker, extendFrost, extendHeadroom } from "./extend-rules";

/** Testnet storage price on 2026-10-18, FROST per MiB per epoch (system object). */
const TESTNET_PRICE = 2_464n;
/** A 1-byte blob encodes to 66,034,000 bytes on 1000 shards: 63 started MiB. */
const SMALL_ENCODED = 66_034_000n;

describe("extendHeadroom (Move system_state_inner.move:399-404)", () => {
	it("allows end - now + extra up to 53 epochs", () => {
		expect(extendHeadroom(555, 554, 53)).toBe(52);
		expect(extendHeadroom(603, 554, 53)).toBe(4);
		expect(extendHeadroom(607, 554, 53)).toBe(0);
	});

	it("never goes below zero", () => {
		expect(extendHeadroom(700, 554, 53)).toBe(0);
	});

	it("works the same with Walrus Mainnet's 14-day epochs", () => {
		expect(
			extendHeadroom(MAINNET_CLOCK.epoch + 3, MAINNET_CLOCK.epoch, 53),
		).toBe(50);
	});
});

describe("extendBlocker", () => {
	it("blocks an expired blob, even an uncertified one", () => {
		expect(
			extendBlocker({ certifiedEpoch: null, endEpoch: 554 }, TESTNET_CLOCK, 53),
		).toEqual({ kind: "expired", endEpoch: 554 });
	});

	it("blocks a registered blob: only certified blobs extend", () => {
		expect(
			extendBlocker({ certifiedEpoch: null, endEpoch: 556 }, TESTNET_CLOCK, 53),
		).toEqual({ kind: "registered" });
	});

	it("blocks a blob already paid 53 epochs ahead", () => {
		expect(
			extendBlocker({ certifiedEpoch: 554, endEpoch: 607 }, TESTNET_CLOCK, 53),
		).toEqual({ kind: "at-limit", maxEpochsAhead: 53 });
	});

	it("allows a live certified blob below the limit", () => {
		expect(
			extendBlocker({ certifiedEpoch: 553, endEpoch: 555 }, TESTNET_CLOCK, 53),
		).toBeNull();
	});
});

describe("extendFrost (PROTOCOL-NOTES section 8)", () => {
	it("is units × storage price × epochs, with no write fee", () => {
		// 63 units × 2,464 FROST × 1 epoch: what the app showed for a 1-epoch extend.
		expect(extendFrost(SMALL_ENCODED, 1, TESTNET_PRICE)).toBe(155_232n);
		expect(extendFrost(SMALL_ENCODED, 5, TESTNET_PRICE)).toBe(776_160n);
	});

	it("bills per started MiB of encoded size", () => {
		expect(extendFrost(1_048_576n, 1, 10n)).toBe(10n);
		expect(extendFrost(1_048_577n, 1, 10n)).toBe(20n);
	});

	it("matches the notes' Walrus Mainnet example: 67 units for 27 epochs", () => {
		// 1.2 MB encodes to 70,038,000 B = 67 MiB units; price 51,854 (notes section 13, item 6).
		expect(extendFrost(70_038_000n, 27, 51_854n)).toBe(93_803_886n);
	});
});
