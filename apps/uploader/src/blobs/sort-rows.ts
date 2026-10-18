import type { BlobRow } from "./blob-row";
import type { BlobStatusKind } from "./blob-status";

export type SortKey = "name" | "size" | "expiry" | "status";
export type SortDirection = "ascending" | "descending";

export interface RowSort {
	key: SortKey;
	direction: SortDirection;
}

/** Longest-paid first, so expired records sink to the bottom as in the design. */
export const DEFAULT_SORT: RowSort = { key: "expiry", direction: "descending" };

/** The direction a column starts in when it is first picked. */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
	name: "ascending",
	size: "descending",
	expiry: "ascending",
	status: "ascending",
};

/** Ascending status order puts what needs attention first. */
const STATUS_ORDER: Record<BlobStatusKind, number> = {
	expiring: 0,
	registered: 1,
	expired: 2,
	encrypted: 3,
	certified: 4,
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
		case "expiry":
			return a.blob.endEpoch - b.blob.endEpoch;
		case "status":
			return STATUS_ORDER[a.status.kind] - STATUS_ORDER[b.status.kind];
	}
}

function compareBigInt(a: bigint, b: bigint): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
