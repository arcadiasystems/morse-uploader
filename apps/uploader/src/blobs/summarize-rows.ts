import type { BlobRow } from "./blob-row";
import { BLOB_FILTERS, type BlobFilter, matchesFilter } from "./filter-rows";

export interface BlobSummary {
	/** How many blobs each sidebar view holds. */
	counts: Readonly<Record<BlobFilter, number>>;
	/** Unencoded bytes across every listed blob. */
	totalSize: bigint;
	/** The certified blob whose paid storage ends first, if any is still live. */
	nextToExpire: BlobRow | null;
}

/** Counts, total size and the next expiry, all from the listed blobs. */
export function summarizeRows(rows: readonly BlobRow[]): BlobSummary {
	const counts: Record<BlobFilter, number> = {
		all: 0,
		quilts: 0,
		encrypted: 0,
		expiring: 0,
		expired: 0,
	};
	let totalSize = 0n;
	let nextToExpire: BlobRow | null = null;
	for (const row of rows) {
		for (const filter of BLOB_FILTERS) {
			if (matchesFilter(row, filter)) counts[filter] += 1;
		}
		totalSize += row.blob.size;
		const live =
			row.status.kind !== "expired" && row.status.kind !== "registered";
		if (
			live &&
			(nextToExpire === null ||
				row.status.expiresAtMs < nextToExpire.status.expiresAtMs)
		) {
			nextToExpire = row;
		}
	}
	return { counts, totalSize, nextToExpire };
}
