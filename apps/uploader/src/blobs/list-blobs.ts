import { type BlobRow, toBlobRows } from "./blob-row";
import type { EpochClock } from "./epoch-clock";
import { type BlobSummary, summarizeRows } from "./summarize-rows";
import type { BlobListing } from "./use-blob-listing";

/** A read of the wallet's blobs, with every status computed for one moment. */
export interface ListedBlobs {
	rows: readonly BlobRow[];
	summary: BlobSummary;
	clock: EpochClock;
	/** The moment statuses and days left are computed for: the read time. */
	nowMs: number;
}

export function listBlobs(listing: BlobListing, nowMs: number): ListedBlobs {
	const rows = toBlobRows(listing.blobs, listing.clock, nowMs);
	return { rows, summary: summarizeRows(rows), clock: listing.clock, nowMs };
}
