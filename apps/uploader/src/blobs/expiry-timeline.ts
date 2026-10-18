import type { BlobRow } from "./blob-row";

/**
 * The Overview's expiry timeline: how many blobs' paid storage ends in each
 * of the next calendar months, in the viewer's time zone. Each blob's end is
 * estimated from its end epoch and the epoch length (`BlobStatus`), so a
 * blob lands in the month its end epoch is expected to start.
 *
 * Each month splits by state, using the status colours:
 * - `unfinished`: registered and never certified; its storage ends unused
 *   unless it is finished.
 * - `soon`: certified, ending within 30 days (the Expiring filter).
 * - `later`: certified, ending after that.
 */
export interface TimelineMonth {
	/** Local midnight on the first day of the month. */
	startMs: number;
	unfinished: number;
	soon: number;
	later: number;
	total: number;
}

export interface ExpiryTimeline {
	months: readonly TimelineMonth[];
	/** Blobs whose storage ends after the last month shown. */
	beyond: number;
	/** The largest month's total, which the tallest bar stands for. */
	peak: number;
}

export const TIMELINE_MONTHS = 12;

export function expiryTimeline(
	rows: readonly BlobRow[],
	nowMs: number,
	count: number = TIMELINE_MONTHS,
): ExpiryTimeline {
	const now = new Date(nowMs);
	const year = now.getFullYear();
	const month = now.getMonth();
	const months: TimelineMonth[] = Array.from({ length: count }, (_, index) => ({
		startMs: new Date(year, month + index, 1).getTime(),
		unfinished: 0,
		soon: 0,
		later: 0,
		total: 0,
	}));
	const endMs = new Date(year, month + count, 1).getTime();
	let beyond = 0;
	for (const row of rows) {
		const { kind, expiresAtMs } = row.status;
		if (kind === "expired") continue;
		if (expiresAtMs >= endMs) {
			beyond += 1;
			continue;
		}
		const ends = new Date(expiresAtMs);
		const index = Math.max(
			0,
			(ends.getFullYear() - year) * 12 + ends.getMonth() - month,
		);
		const bucket = months[index];
		if (!bucket) continue;
		if (kind === "registered") bucket.unfinished += 1;
		else if (kind === "expiring") bucket.soon += 1;
		else bucket.later += 1;
		bucket.total += 1;
	}
	return {
		months,
		beyond,
		peak: months.reduce((peak, bucket) => Math.max(peak, bucket.total), 0),
	};
}
