import { describe, expect, it } from "vitest";
import { blobRow } from "@/blobs/fixtures";
import {
	EMPTY_SELECTION,
	pruneSelection,
	selectedRows,
	selectionInView,
	setSelected,
	toggleSelected,
} from "./selection";

const a = blobRow({ name: "a.txt" });
const b = blobRow({ name: "b.txt" });
const c = blobRow({ name: "c.txt" });
const id = (row: typeof a) => row.blob.objectId;

describe("toggleSelected", () => {
	it("selects an unselected blob and unselects a selected one", () => {
		const once = toggleSelected(EMPTY_SELECTION, id(a));
		expect([...once]).toEqual([id(a)]);
		expect(toggleSelected(once, id(a)).size).toBe(0);
	});

	it("leaves the selection it was given unchanged", () => {
		const before = new Set([id(a)]);
		toggleSelected(before, id(b));
		expect([...before]).toEqual([id(a)]);
	});
});

describe("setSelected: the header box acts on what the view lists", () => {
	it("selects every listed blob and keeps a hidden selection", () => {
		const hidden = new Set([id(c)]);
		const next = setSelected(hidden, [id(a), id(b)], true);
		expect([...next].sort()).toEqual([id(a), id(b), id(c)].sort());
	});

	it("clears only the listed blobs, keeping the hidden selection", () => {
		const all = new Set([id(a), id(b), id(c)]);
		const next = setSelected(all, [id(a), id(b)], false);
		expect([...next]).toEqual([id(c)]);
	});
});

describe("pruneSelection", () => {
	it("drops blobs the listing no longer holds", () => {
		const selection = new Set([id(a), id(b)]);
		expect([...pruneSelection(selection, [a, c])]).toEqual([id(a)]);
	});

	it("returns the same set when every selected blob is still listed", () => {
		const selection = new Set([id(a), id(b)]);
		expect(pruneSelection(selection, [a, b, c])).toBe(selection);
		expect(pruneSelection(EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION);
	});
});

describe("selectedRows", () => {
	it("keeps the listing's order, not the order of selecting", () => {
		const selection = new Set([id(c), id(a)]);
		expect(selectedRows(selection, [a, b, c])).toEqual([a, c]);
	});
});

describe("selectionInView", () => {
	it("counts the selected blobs the view shows and the ones it hides", () => {
		const selection = new Set([id(a), id(b), id(c)]);
		expect(selectionInView(selection, [a, b])).toEqual({ shown: 2, hidden: 1 });
		expect(selectionInView(selection, [])).toEqual({ shown: 0, hidden: 3 });
		expect(selectionInView(EMPTY_SELECTION, [a])).toEqual({
			shown: 0,
			hidden: 0,
		});
	});
});
