import type { EpochClock } from "@/blobs/epoch-clock";
import type { NetworkId } from "@/network/networks";

/**
 * Storage periods mapped to Walrus epochs (PROTOCOL-NOTES section 5).
 * Storage runs while `epoch < end_epoch`, and the current epoch is already
 * partly used, so a period buys enough epochs to cover at least that long
 * from now: `ceil((now + period - epochStart) / epochDuration)`. Rounding
 * down would deliver less than the period.
 *
 * Each network offers the periods that make sense within 53 epochs (notes
 * section 13, item 4): Testnet epochs last a day, so it offers 7 days, 30
 * days and the most it stores ahead; Walrus Mainnet epochs last 14 days, so
 * it keeps 30 days to 2 years, and 2 years only fits early in an epoch.
 */

const DAY_MS = 86_400_000;

export type PeriodId = "7d" | "30d" | "6m" | "1y" | "2y" | "max";

interface PeriodSpec {
	id: PeriodId;
	label: string;
	/** `null` buys the most epochs Walrus stores ahead. */
	days: number | null;
}

const PERIODS: Readonly<Record<NetworkId, readonly PeriodSpec[]>> = {
	testnet: [
		{ id: "7d", label: "7 days", days: 7 },
		{ id: "30d", label: "30 days", days: 30 },
		{ id: "max", label: "Max", days: null },
	],
	mainnet: [
		{ id: "30d", label: "30 days", days: 30 },
		{ id: "6m", label: "6 months", days: 182.5 },
		{ id: "1y", label: "1 year", days: 365 },
		{ id: "2y", label: "2 years", days: 730 },
	],
};

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
 * The network's periods with the epochs each needs. A period that needs
 * more than `maxEpochsAhead` epochs (53 on both networks) does not fit:
 * `reserve_space` aborts beyond it. Max is always `maxEpochsAhead` epochs,
 * labelled with the whole days it covers, since the current epoch is
 * already partly used.
 */
export function periodOptions(
	network: NetworkId,
	clock: EpochClock,
	maxEpochsAhead: number,
	nowMs: number,
): PeriodOption[] {
	const nextEpochStartMs = clock.epochStartMs + clock.epochDurationMs;
	return PERIODS[network].map(({ id, label, days }): PeriodOption => {
		if (days === null) {
			const endsAtMs = storageEndMs(maxEpochsAhead, clock);
			const covered = Math.floor((endsAtMs - nowMs) / DAY_MS);
			return {
				id,
				label: `${label} (about ${covered} days)`,
				fits: true,
				epochs: maxEpochsAhead,
				endsAtMs,
			};
		}
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

/** Whether a stored value names one of the periods. */
export function isPeriodId(value: unknown): value is PeriodId {
	return (
		typeof value === "string" &&
		Object.values(PERIODS).some((periods) =>
			periods.some((period) => period.id === value),
		)
	);
}
