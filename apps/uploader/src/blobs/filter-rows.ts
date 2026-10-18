import type { BlobRow } from "./blob-row";

/** The subsets of the wallet's blobs that the sidebar counts and the pane can show. */
export const BLOB_FILTERS = [
	"all",
	"quilts",
	"encrypted",
	"expiring",
	"expired",
] as const;

export type BlobFilter = (typeof BLOB_FILTERS)[number];

export function matchesFilter(row: BlobRow, filter: BlobFilter): boolean {
	switch (filter) {
		case "all":
			return true;
		case "quilts":
			return row.blob.isQuilt;
		case "encrypted":
			return row.blob.isEncrypted;
		case "expiring":
			return row.status.kind === "expiring";
		case "expired":
			return row.status.kind === "expired";
	}
}
