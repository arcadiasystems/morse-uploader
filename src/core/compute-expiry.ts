import type { EpochSchedule, FileExpiry } from "../types.js";

/**
 * Convert a Walrus storage end-epoch to wall-clock expiry.
 *
 * When `schedule.firstEpochStartMs` is known the result is absolute
 * (firstEpochStartMs + endEpoch * epochDurationMs). Otherwise it is relative to
 * `nowMs` and the current epoch, which ignores how far into the current epoch we
 * already are and so can overestimate the remaining time by up to one epoch.
 */
export function computeExpiry(
	endEpoch: number,
	schedule: EpochSchedule,
	nowMs: number,
): FileExpiry {
	const expiresAtMs =
		schedule.firstEpochStartMs === undefined
			? nowMs + (endEpoch - schedule.currentEpoch) * schedule.epochDurationMs
			: schedule.firstEpochStartMs + endEpoch * schedule.epochDurationMs;
	const expiresInMs = expiresAtMs - nowMs;
	return { endEpoch, expiresAtMs, expiresInMs, expired: expiresInMs <= 0 };
}
