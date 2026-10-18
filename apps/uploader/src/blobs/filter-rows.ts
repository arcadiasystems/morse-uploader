import type { BlobRow } from "./blob-row";

/** The Files filters, as the chips list them. */
export const BLOB_FILTERS = [
	"all",
	"quilts",
	"encrypted",
	"expiring",
	"published",
	"shared",
] as const;

export type BlobFilter = (typeof BLOB_FILTERS)[number];

/**
 * What Morse records about the wallet's blobs, by object id: the blobs a
 * publication's public entry points at, and the blobs whose RecipientFile
 * someone besides the owner can decrypt. `null` while unknown.
 */
export interface MorseMarks {
	published: ReadonlySet<string> | null;
	shared: ReadonlySet<string> | null;
}

export const NO_MARKS: MorseMarks = { published: null, shared: null };

export function matchesFilter(
	row: BlobRow,
	filter: BlobFilter,
	marks: MorseMarks = NO_MARKS,
): boolean {
	switch (filter) {
		case "all":
			return true;
		case "quilts":
			return row.blob.isQuilt;
		case "encrypted":
			return row.blob.isEncrypted;
		case "expiring":
			return row.status.kind === "expiring";
		case "published":
			return marks.published?.has(row.blob.objectId) ?? false;
		case "shared":
			return marks.shared?.has(row.blob.objectId) ?? false;
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
	marks: MorseMarks = NO_MARKS,
): BlobRow[] {
	return rows.filter(
		(row) => matchesFilter(row, filter, marks) && matchesSearch(row, query),
	);
}

/**
 * How many blobs each filter holds. Published and Shared are `null` while
 * their Morse marks are unknown: a count that cannot be real is not shown.
 */
export function filterCounts(
	rows: readonly BlobRow[],
	marks: MorseMarks,
): Readonly<Record<BlobFilter, number | null>> {
	const counts: Record<BlobFilter, number | null> = {
		all: 0,
		quilts: 0,
		encrypted: 0,
		expiring: 0,
		published: marks.published === null ? null : 0,
		shared: marks.shared === null ? null : 0,
	};
	for (const row of rows) {
		for (const filter of BLOB_FILTERS) {
			const count = counts[filter];
			if (count !== null && matchesFilter(row, filter, marks))
				counts[filter] = count + 1;
		}
	}
	return counts;
}
