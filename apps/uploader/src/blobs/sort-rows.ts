import type { BlobRow } from "./blob-row";

/** The Files columns a list sorts by; `uploaded` is the registered epoch. */
export type SortKey = "name" | "size" | "uploaded" | "expiry";
export type SortDirection = "ascending" | "descending";

export interface RowSort {
	key: SortKey;
	direction: SortDirection;
}

/** Newest first, as the design's "sort · newest". */
export const DEFAULT_SORT: RowSort = {
	key: "uploaded",
	direction: "descending",
};

/** The direction a column starts in when it is first picked. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
	name: "ascending",
	size: "descending",
	uploaded: "descending",
	expiry: "ascending",
};

const collator = new Intl.Collator("en", {
	numeric: true,
	sensitivity: "base",
});

/** Picking the sorted column flips its direction; picking another starts it in its first direction. */
export function nextSort(current: RowSort, key: SortKey): RowSort {
	if (current.key === key) {
		return {
			key,
			direction: current.direction === "ascending" ? "descending" : "ascending",
		};
	}
	return { key, direction: FIRST_DIRECTION[key] };
}

/**
 * Sorts rows by the key, then by expiry, name and object id so the order is
 * stable and the same on every read.
 */
export function sortRows(rows: readonly BlobRow[], sort: RowSort): BlobRow[] {
	const sign = sort.direction === "ascending" ? 1 : -1;
	return [...rows].sort(
		(a, b) =>
			sign * compareBy(sort.key, a, b) ||
			compareBy("expiry", a, b) ||
			compareBy("name", a, b) ||
			compareText(a.blob.objectId, b.blob.objectId),
	);
}

function compareBy(key: SortKey, a: BlobRow, b: BlobRow): number {
	switch (key) {
		case "name":
			return collator.compare(a.label, b.label);
		case "size":
			return compareBigInt(a.blob.size, b.blob.size);
		case "uploaded":
			return a.blob.registeredEpoch - b.blob.registeredEpoch;
		case "expiry":
			return a.blob.endEpoch - b.blob.endEpoch;
	}
}

function compareBigInt(a: bigint, b: bigint): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
