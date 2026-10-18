import type { BlobRow } from "@/blobs/blob-row";
import type { ListItem } from "../files/list-items";

/** What the drawer shows: a blob (a plain blob or a whole quilt), or one file in a quilt. */
export type DrawerTarget =
	| { kind: "blob"; row: BlobRow }
	| { kind: "patch"; quilt: BlobRow; identifier: string };

/** The drawer's target for a list item; a quilt's status lines stand for the quilt. */
export function drawerTarget(item: ListItem): DrawerTarget {
	switch (item.kind) {
		case "blob":
			return { kind: "blob", row: item.row };
		case "patch":
			return { kind: "patch", quilt: item.quilt, identifier: item.identifier };
		case "patches-loading":
		case "patches-error":
			return { kind: "blob", row: item.quilt };
	}
}

/** The Blob object a target lives in: the blob itself, or a file's quilt. */
export function targetRow(target: DrawerTarget): BlobRow {
	return target.kind === "blob" ? target.row : target.quilt;
}
