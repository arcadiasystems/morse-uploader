import { describe, expect, it } from "vitest";
import { hasReadablePatches } from "@/blobs/blob-row";
import { blobRow } from "@/blobs/fixtures";
import type { QuiltPatches } from "@/blobs/quilt-patch-store";
import {
	buildListItems,
	ITEM_HEIGHT,
	layoutItems,
	parentKey,
} from "./list-items";

const quilt = blobRow({ name: "site-export", isQuilt: true, endEpoch: 556 });
const plain = blobRow({ name: "hero.png" });
const ready = (identifiers: string[]): QuiltPatches => ({
	count: { status: "ready", data: identifiers.length },
	identifiers: { status: "ready", data: identifiers },
});

describe("quilt rows", () => {
	it("can open only certified quilts whose storage has not ended", () => {
		expect(hasReadablePatches(quilt)).toBe(true);
		expect(hasReadablePatches(plain)).toBe(false);
		expect(hasReadablePatches(blobRow({ isQuilt: true, endEpoch: 474 }))).toBe(
			false,
		);
		expect(
			hasReadablePatches(
				blobRow({ isQuilt: true, certifiedEpoch: null, endEpoch: 556 }),
			),
		).toBe(false);
	});

	it("lists a closed quilt as one row that can be expanded", () => {
		const items = buildListItems([quilt, plain], new Set(), new Map());
		expect(items.map((item) => [item.kind, item.key])).toEqual([
			["blob", quilt.blob.objectId],
			["blob", plain.blob.objectId],
		]);
		expect(items[0]).toMatchObject({
			expanded: false,
			position: 1,
			setSize: 2,
		});
		expect(items[1]).toMatchObject({ expanded: null, position: 2 });
	});

	it("shows an open quilt's patches by identifier, in index order", () => {
		const items = buildListItems(
			[quilt, plain],
			new Set([quilt.blob.objectId]),
			new Map([[quilt.blob.blobId, ready(["index.html", "assets/a.png"])]]),
		);
		expect(items.map((item) => item.kind)).toEqual([
			"blob",
			"patch",
			"patch",
			"blob",
		]);
		expect(items[0]).toMatchObject({ expanded: true });
		expect(items[2]).toMatchObject({
			identifier: "assets/a.png",
			position: 2,
			setSize: 2,
		});
		const patch = items[1];
		if (!patch) throw new Error("missing patch row");
		expect(parentKey(patch)).toBe(quilt.blob.objectId);
	});

	it("shows a reading line, then an error line with what failed", () => {
		const open = new Set([quilt.blob.objectId]);
		expect(buildListItems([quilt], open, new Map())[1]?.kind).toBe(
			"patches-loading",
		);
		const error = new Error("No storage node answered.");
		const failed = buildListItems(
			[quilt],
			open,
			new Map([
				[
					quilt.blob.blobId,
					{
						count: { status: "error", error },
						identifiers: { status: "error", error },
					},
				],
			]),
		);
		expect(failed[1]).toMatchObject({ kind: "patches-error", error });
	});

	it("ignores an open state for blobs that cannot be opened", () => {
		const items = buildListItems(
			[plain],
			new Set([plain.blob.objectId]),
			new Map(),
		);
		expect(items).toHaveLength(1);
	});
});

describe("layoutItems", () => {
	it("stacks fixed row heights", () => {
		const items = buildListItems(
			[quilt, plain],
			new Set([quilt.blob.objectId]),
			new Map([[quilt.blob.blobId, ready(["a", "b"])]]),
		);
		const { tops, height } = layoutItems(items);
		const blob = ITEM_HEIGHT.blob;
		const patch = ITEM_HEIGHT.patch;
		expect(tops).toEqual([0, blob, blob + patch, blob + 2 * patch]);
		expect(height).toBe(2 * blob + 2 * patch);
	});
});
