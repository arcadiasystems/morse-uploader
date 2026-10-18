import { type BlobRow, hasReadablePatches } from "@/blobs/blob-row";
import { type QuiltPatches, UNREAD_PATCHES } from "@/blobs/quilt-patch-store";

/** One line of the Files list: a blob, a quilt patch, or a quilt's read status. */
export type ListItem =
	| {
			kind: "blob";
			key: string;
			row: BlobRow;
			/** 1-based position among the listed blobs. */
			position: number;
			setSize: number;
			/** `null` when the blob has no patches to show. */
			expanded: boolean | null;
	  }
	| {
			kind: "patch";
			key: string;
			quilt: BlobRow;
			identifier: string;
			position: number;
			setSize: number;
	  }
	| {
			kind: "patches-loading";
			key: string;
			quilt: BlobRow;
	  }
	| {
			kind: "patches-error";
			key: string;
			quilt: BlobRow;
			error: unknown;
	  };

/** Fixed heights, border included, keep the virtual window's arithmetic exact. */
export const ITEM_HEIGHT: Readonly<Record<ListItem["kind"], number>> = {
	blob: 53,
	patch: 38,
	"patches-loading": 38,
	"patches-error": 38,
};

/**
 * Flattens the visible tree: each blob, and under each expanded quilt its
 * patches, or a line saying they are being read or could not be.
 */
export function buildListItems(
	rows: readonly BlobRow[],
	expanded: ReadonlySet<string>,
	patches: ReadonlyMap<string, QuiltPatches>,
): ListItem[] {
	const items: ListItem[] = [];
	rows.forEach((row, index) => {
		const { objectId, blobId } = row.blob;
		const expandable = hasReadablePatches(row);
		const isOpen = expandable && expanded.has(objectId);
		items.push({
			kind: "blob",
			key: objectId,
			row,
			position: index + 1,
			setSize: rows.length,
			expanded: expandable ? isOpen : null,
		});
		if (!isOpen) return;
		const identifiers = (patches.get(blobId) ?? UNREAD_PATCHES).identifiers;
		switch (identifiers.status) {
			case "idle":
			case "loading":
				items.push({
					kind: "patches-loading",
					key: `${objectId}:loading`,
					quilt: row,
				});
				break;
			case "error":
				items.push({
					kind: "patches-error",
					key: `${objectId}:error`,
					quilt: row,
					error: identifiers.error,
				});
				break;
			case "ready":
				identifiers.data.forEach((identifier, patchIndex) => {
					items.push({
						kind: "patch",
						key: `${objectId}:${patchIndex}`,
						quilt: row,
						identifier,
						position: patchIndex + 1,
						setSize: identifiers.data.length,
					});
				});
				break;
		}
	});
	return items;
}

/** The top of each item and the list's total height, in pixels. */
export function layoutItems(items: readonly ListItem[]): {
	tops: number[];
	height: number;
} {
	const tops: number[] = [];
	let height = 0;
	for (const item of items) {
		tops.push(height);
		height += ITEM_HEIGHT[item.kind];
	}
	return { tops, height };
}

/** The item a patch or status line belongs to; a blob is its own parent. */
export function parentKey(item: ListItem): string {
	return item.kind === "blob" ? item.key : item.quilt.blob.objectId;
}
