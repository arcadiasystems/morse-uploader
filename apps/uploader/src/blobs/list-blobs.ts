import { type BlobRow, toBlobRows } from "./blob-row";
import type { EpochClock } from "./epoch-clock";
import type { BlobListing } from "./use-blob-listing";

/** A read of the wallet's blobs, with every status computed for one moment. */
export interface ListedBlobs {
	rows: readonly BlobRow[];
	/** Unencoded bytes across every listed blob. */
	totalSize: bigint;
	clock: EpochClock;
	/** The moment statuses and days left are computed for: the read time. */
	nowMs: number;
}

export function listBlobs(listing: BlobListing, nowMs: number): ListedBlobs {
	const rows = toBlobRows(listing.blobs, listing.clock, nowMs);
	return {
		rows,
		totalSize: rows.reduce((sum, row) => sum + row.blob.size, 0n),
		clock: listing.clock,
		nowMs,
	};
}
