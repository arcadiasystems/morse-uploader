import type { EpochClock } from "@/blobs/epoch-clock";

/**
 * Storage periods mapped to Walrus epochs (PROTOCOL-NOTES section 5).
 * Storage runs while `epoch < end_epoch`, and the current epoch is already
 * partly used, so a period buys enough epochs to cover at least that long
 * from now: `ceil((now + period - epochStart) / epochDuration)`. Rounding
 * down would deliver less than the period.
 */

const DAY_MS = 86_400_000;

export const PERIODS = [
	{ id: "30d", label: "30 days", days: 30 },
	{ id: "6m", label: "6 months", days: 182.5 },
	{ id: "1y", label: "1 year", days: 365 },
	{ id: "2y", label: "2 years", days: 730 },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export type PeriodOption =
	| {
			id: PeriodId;
			label: string;
			fits: true;
			epochs: number;
			/** When the storage ends, estimated from the epoch clock. */
			endsAtMs: number;
	  }
	| {
			id: PeriodId;
			label: string;
			fits: false;
			/** The epochs the period would need, more than Walrus allows. */
			epochs: number;
			/**
			 * When it fits again: at the next epoch start, if only the part of the
			 * current epoch already used is in the way; otherwise never (`null`).
			 */
			availableAtMs: number | null;
	  };

/** The epochs that cover at least `days` from `nowMs`. Never less than 1. */
export function epochsForDays(
	days: number,
	clock: EpochClock,
	nowMs: number,
): number {
	const elapsed = nowMs + days * DAY_MS - clock.epochStartMs;
	return Math.max(1, Math.ceil(elapsed / clock.epochDurationMs));
}

/** When storage bought now for `epochs` epochs ends: the start of epoch `current + epochs`. */
export function storageEndMs(epochs: number, clock: EpochClock): number {
	return clock.epochStartMs + epochs * clock.epochDurationMs;
}

/**
 * Each period with the epochs it needs on this network. A period that needs
 * more than `maxEpochsAhead` epochs (53 on both networks) does not fit:
 * `reserve_space` aborts beyond it.
 */
export function periodOptions(
	clock: EpochClock,
	maxEpochsAhead: number,
	nowMs: number,
): PeriodOption[] {
	const nextEpochStartMs = clock.epochStartMs + clock.epochDurationMs;
	return PERIODS.map(({ id, label, days }) => {
		const epochs = epochsForDays(days, clock, nowMs);
		if (epochs <= maxEpochsAhead)
			return {
				id,
				label,
				fits: true,
				epochs,
				endsAtMs: storageEndMs(epochs, clock),
			};
		const atEpochStart = Math.ceil((days * DAY_MS) / clock.epochDurationMs);
		return {
			id,
			label,
			fits: false,
			epochs,
			availableAtMs: atEpochStart <= maxEpochsAhead ? nextEpochStartMs : null,
		};
	});
}
