import { describe, expect, it } from "vitest";
import type { EpochClock } from "@/blobs/epoch-clock";
import { epochsForDays, periodOptions, storageEndMs } from "./periods";

const DAY_MS = 86_400_000;

// The live clocks from PROTOCOL-NOTES section 5, read 2026-10-17T19:52Z.
const NOW = Date.parse("2026-10-17T19:52:00Z");
const TESTNET: EpochClock = {
	epoch: 553,
	epochStartMs: Date.parse("2026-10-16T22:46:52Z"),
	epochDurationMs: DAY_MS,
};
const MAINNET: EpochClock = {
	epoch: 41,
	epochStartMs: Date.parse("2026-10-06T15:10:31Z"),
	epochDurationMs: 14 * DAY_MS,
};

describe("periodOptions", () => {
	it("offers only 30 days on Testnet, where 53 one-day epochs are the most", () => {
		const options = periodOptions(TESTNET, 53, NOW);
		expect(
			options.map((option) => [option.id, option.fits, option.epochs]),
		).toEqual([
			["30d", true, 31],
			["6m", false, 184],
			["1y", false, 366],
			["2y", false, 731],
		]);
	});

	it("maps the periods to 3, 14 and 27 epochs on Walrus Mainnet, matching the notes", () => {
		const options = periodOptions(MAINNET, 53, NOW);
		expect(
			options.map((option) => [option.id, option.fits, option.epochs]),
		).toEqual([
			["30d", true, 3],
			["6m", true, 14],
			["1y", true, 27],
			// 11 days into the epoch, so 2 years still fits in 53 epochs.
			["2y", true, 53],
		]);
	});

	it("drops 2 years on Walrus Mainnet more than 12 days into an epoch", () => {
		const late = MAINNET.epochStartMs + 13 * DAY_MS;
		const twoYears = periodOptions(MAINNET, 53, late)[3];
		expect(twoYears).toEqual({
			id: "2y",
			label: "2 years",
			fits: false,
			epochs: 54,
			// 730 days is 52.1 epochs: it fits again from the next epoch start.
			availableAtMs: MAINNET.epochStartMs + 14 * DAY_MS,
		});
	});

	it("never offers 6 months or more on Testnet", () => {
		const options = periodOptions(TESTNET, 53, NOW);
		expect(
			options.flatMap((option) => (option.fits ? [] : [option.availableAtMs])),
		).toEqual([null, null, null]);
	});

	it("estimates when the storage ends from the epoch start", () => {
		const [thirtyDays] = periodOptions(TESTNET, 53, NOW);
		expect(
			thirtyDays?.fits && new Date(thirtyDays.endsAtMs).toISOString(),
		).toBe("2026-11-16T22:46:52.000Z");
	});
});

describe("epochsForDays", () => {
	it("covers at least the period, counting the part of the epoch already used", () => {
		const justStarted = TESTNET.epochStartMs + 1;
		expect(epochsForDays(30, TESTNET, justStarted)).toBe(31);
		expect(epochsForDays(30, TESTNET, TESTNET.epochStartMs)).toBe(30);
	});

	it("never asks for less than one epoch", () => {
		expect(epochsForDays(0, TESTNET, TESTNET.epochStartMs)).toBe(1);
	});
});

describe("storageEndMs", () => {
	it("ends at the start of epoch current + epochs", () => {
		expect(storageEndMs(1, TESTNET)).toBe(TESTNET.epochStartMs + DAY_MS);
	});
});
