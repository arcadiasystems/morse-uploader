import type { BlobRow } from "./blob-row";

/** A blob's paid storage end: its end epoch and the estimated moment that epoch starts. */
export interface StorageEnd {
	endEpoch: number;
	expiresAtMs: number;
	/** Whole days left, from the blob's status. */
	daysLeft: number;
}

/**
 * The Overview's numbers, all from the listed Blob objects:
 *
 * - `stored`: certified blobs whose storage has not ended. A registered
 *   blob was never confirmed stored, and an expired one's slivers may be
 *   gone, so neither counts as stored.
 * - `firstEnd` and `lastEnd`: the stored blob whose paid storage ends first
 *   and last. Every stored blob is paid until at least `firstEnd`.
 * - `expiringSoon`: stored blobs ending within 30 days, the Expiring filter.
 */
export interface OverviewSummary {
	owned: number;
	stored: {
		blobs: number;
		quilts: number;
		encrypted: number;
		/** Unencoded bytes. */
		size: bigint;
		/** Encoded bytes: what storage is paid for. */
		encodedSize: bigint;
	};
	/** Registered, never certified, storage not ended: Finish or delete them. */
	unfinished: number;
	expired: number;
	expiringSoon: readonly BlobRow[];
	firstEnd: StorageEnd | null;
	lastEnd: StorageEnd | null;
}

export function summarizeOverview(rows: readonly BlobRow[]): OverviewSummary {
	const stored = {
		blobs: 0,
		quilts: 0,
		encrypted: 0,
		size: 0n,
		encodedSize: 0n,
	};
	let unfinished = 0;
	let expired = 0;
	const expiringSoon: BlobRow[] = [];
	let first: BlobRow | null = null;
	let last: BlobRow | null = null;
	for (const row of rows) {
		const { kind } = row.status;
		if (kind === "expired") {
			expired += 1;
			continue;
		}
		if (kind === "registered") {
			unfinished += 1;
			continue;
		}
		stored.blobs += 1;
		if (row.blob.isQuilt) stored.quilts += 1;
		if (row.blob.isEncrypted) stored.encrypted += 1;
		stored.size += row.blob.size;
		stored.encodedSize += row.blob.encodedSize;
		if (kind === "expiring") expiringSoon.push(row);
		if (first === null || row.blob.endEpoch < first.blob.endEpoch) first = row;
		if (last === null || row.blob.endEpoch > last.blob.endEpoch) last = row;
	}
	return {
		owned: rows.length,
		stored,
		unfinished,
		expired,
		expiringSoon,
		firstEnd: first && storageEnd(first),
		lastEnd: last && storageEnd(last),
	};
}

function storageEnd(row: BlobRow): StorageEnd {
	return {
		endEpoch: row.blob.endEpoch,
		expiresAtMs: row.status.expiresAtMs,
		daysLeft: row.status.daysLeft,
	};
}
