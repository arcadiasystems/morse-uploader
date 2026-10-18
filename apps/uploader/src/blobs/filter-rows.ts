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

/**
 * Whether a row matches a search: a case-insensitive substring of its name,
 * blob id or object id. An empty or blank query matches every row.
 */
export function matchesSearch(row: BlobRow, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (needle === "") return true;
	const { name, blobId, objectId } = row.blob;
	return [name ?? "", blobId, objectId].some((field) =>
		field.toLowerCase().includes(needle),
	);
}

export function filterRows(
	rows: readonly BlobRow[],
	filter: BlobFilter,
	query: string,
): BlobRow[] {
	return rows.filter(
		(row) => matchesFilter(row, filter) && matchesSearch(row, query),
	);
}
