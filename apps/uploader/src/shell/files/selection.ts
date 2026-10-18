import type { BlobRow } from "@/blobs/blob-row";

/**
 * The Files selection: a set of Blob object ids. It belongs to one wallet
 * and network, and it survives filter and search changes: a selected blob
 * the current filter hides stays selected, the bulk bar counts it as not
 * in this view, and bulk actions still act on it. Blobs that leave the
 * listing (deleted, or no longer owned) drop out.
 */
export type Selection = ReadonlySet<string>;

export const EMPTY_SELECTION: Selection = new Set();

/** Selects the blob, or unselects it when it is selected. */
export function toggleSelected(
	selection: Selection,
	objectId: string,
): Selection {
	const next = new Set(selection);
	if (!next.delete(objectId)) next.add(objectId);
	return next;
}

/**
 * Selects or unselects every blob the view lists, keeping the selected
 * blobs it does not list as they are.
 */
export function setSelected(
	selection: Selection,
	objectIds: readonly string[],
	selected: boolean,
): Selection {
	const next = new Set(selection);
	for (const objectId of objectIds) {
		if (selected) next.add(objectId);
		else next.delete(objectId);
	}
	return next;
}

/** The selection without blobs the listing no longer holds; the same set when nothing left. */
export function pruneSelection(
	selection: Selection,
	listed: readonly BlobRow[],
): Selection {
	if (selection.size === 0) return selection;
	const present = new Set(listed.map((row) => row.blob.objectId));
	const kept = [...selection].filter((objectId) => present.has(objectId));
	return kept.length === selection.size ? selection : new Set(kept);
}

/** The selected rows, in listing order. */
export function selectedRows(
	selection: Selection,
	listed: readonly BlobRow[],
): BlobRow[] {
	return listed.filter((row) => selection.has(row.blob.objectId));
}

/** How many selected blobs the view lists, and how many it hides. */
export function selectionInView(
	selection: Selection,
	visible: readonly BlobRow[],
): { shown: number; hidden: number } {
	const shown = visible.filter((row) =>
		selection.has(row.blob.objectId),
	).length;
	return { shown, hidden: selection.size - shown };
}
