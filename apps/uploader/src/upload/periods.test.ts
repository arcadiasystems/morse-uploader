import { describe, expect, it } from "vitest";
import type { EpochClock } from "@/blobs/epoch-clock";
import {
	epochsForDays,
	isPeriodId,
	periodOptions,
	storageEndMs,
} from "./periods";

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
	it("offers 7 days, 30 days and Max on Testnet, where 53 one-day epochs are the most (notes item 4)", () => {
		const options = periodOptions("testnet", TESTNET, 53, NOW);
		expect(
			options.map((option) => [
				option.id,
				option.label,
				option.fits,
				option.epochs,
			]),
		).toEqual([
			// 21 hours into the epoch: 7 days from now ends in the 8th epoch.
			["7d", "7 days", true, 8],
			["30d", "30 days", true, 31],
			// 53 epochs from this one's start end on 8 December, 52 whole days away.
			["max", "Max (about 52 days)", true, 53],
		]);
	});

	it("maps the periods to 3, 14 and 27 epochs on Walrus Mainnet, matching the notes", () => {
		const options = periodOptions("mainnet", MAINNET, 53, NOW);
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
		const twoYears = periodOptions("mainnet", MAINNET, 53, late)[3];
		expect(twoYears).toEqual({
			id: "2y",
			label: "2 years",
			fits: false,
			epochs: 54,
			// 730 days is 52.1 epochs: it fits again from the next epoch start.
			availableAtMs: MAINNET.epochStartMs + 14 * DAY_MS,
		});
	});

	it("never offers a period past 53 epochs on Testnet", () => {
		const options = periodOptions("testnet", TESTNET, 53, NOW);
		expect(options.every((option) => option.fits && option.epochs <= 53)).toBe(
			true,
		);
	});

	it("estimates when the storage ends from the epoch start", () => {
		const [, thirtyDays, max] = periodOptions("testnet", TESTNET, 53, NOW);
		expect(
			thirtyDays?.fits && new Date(thirtyDays.endsAtMs).toISOString(),
		).toBe("2026-11-16T22:46:52.000Z");
		expect(max?.fits && new Date(max.endsAtMs).toISOString()).toBe(
			"2026-12-08T22:46:52.000Z",
		);
	});
});

describe("isPeriodId", () => {
	it("knows every network's periods and nothing else", () => {
		for (const id of ["7d", "30d", "6m", "1y", "2y", "max"])
			expect(isPeriodId(id)).toBe(true);
		expect(isPeriodId("3y")).toBe(false);
		expect(isPeriodId(30)).toBe(false);
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
