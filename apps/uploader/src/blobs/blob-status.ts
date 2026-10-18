import type { BlobRecord } from "./blob-record";
import type { EpochClock } from "./epoch-clock";

export const DAY_MS = 86_400_000;

/** Paid storage that ends within this many days counts as expiring soon. */
export const EXPIRING_SOON_DAYS = 30;

/**
 * A blob's status, in priority order when several apply:
 *
 * - `expired`: the end epoch is reached (`end_epoch <= current epoch`); the
 *   object stays owned as its record on Sui.
 * - `registered`: registered but never certified (`certified_epoch` is null).
 * - `expiring`: certified, with paid storage ending within 30 days.
 * - `encrypted`: certified and marked as Seal-encrypted.
 * - `certified`: everything else.
 */
export type BlobStatusKind =
	| "expired"
	| "registered"
	| "expiring"
	| "encrypted"
	| "certified";

export interface BlobStatus {
	kind: BlobStatusKind;
	/** Estimated time the storage ends: the start of epoch `endEpoch`. */
	expiresAtMs: number;
	/** Whole days of paid storage left; 0 once it is under a day or over. */
	daysLeft: number;
	/** Share of the paid storage period still ahead, from 0 to 1. */
	remaining: number;
}

/**
 * The status of a blob at `nowMs`. Storage is valid while the current epoch
 * is below `endEpoch` (PROTOCOL-NOTES section 5), so it ends when epoch
 * `endEpoch` starts: `epochStart + (endEpoch - epoch) × epochDuration`.
 * Dates are estimates, because epochs do not start exactly on schedule.
 */
export function blobStatus(
	blob: Pick<
		BlobRecord,
		"certifiedEpoch" | "startEpoch" | "endEpoch" | "isEncrypted"
	>,
	clock: EpochClock,
	nowMs: number,
): BlobStatus {
	const expiresAtMs =
		clock.epochStartMs + (blob.endEpoch - clock.epoch) * clock.epochDurationMs;
	const expired = blob.endEpoch <= clock.epoch;
	const msLeft = expired ? 0 : Math.max(0, expiresAtMs - nowMs);
	const periodMs = (blob.endEpoch - blob.startEpoch) * clock.epochDurationMs;
	return {
		kind: statusKind(blob, expired, msLeft),
		expiresAtMs,
		daysLeft: Math.floor(msLeft / DAY_MS),
		remaining: periodMs > 0 ? Math.min(1, msLeft / periodMs) : 0,
	};
}

function statusKind(
	blob: Pick<BlobRecord, "certifiedEpoch" | "isEncrypted">,
	expired: boolean,
	msLeft: number,
): BlobStatusKind {
	if (expired) return "expired";
	if (blob.certifiedEpoch === null) return "registered";
	if (msLeft < EXPIRING_SOON_DAYS * DAY_MS) return "expiring";
	return blob.isEncrypted ? "encrypted" : "certified";
}
