import { describe, expect, it } from "vitest";
import {
	filterCounts,
	filterRows,
	type MorseMarks,
	matchesFilter,
	matchesSearch,
	NO_MARKS,
} from "./filter-rows";
import { blobRow } from "./fixtures";

describe("matchesFilter", () => {
	const plain = blobRow();
	const quilt = blobRow({ isQuilt: true });
	const encrypted = blobRow({ isEncrypted: true });
	const expiring = blobRow({ endEpoch: 556 });
	const expired = blobRow({ endEpoch: 474 });
	const registered = blobRow({ certifiedEpoch: null, endEpoch: 556 });

	it("puts every blob in All blobs", () => {
		for (const row of [plain, quilt, encrypted, expiring, expired, registered])
			expect(matchesFilter(row, "all")).toBe(true);
	});

	it("sorts blobs into the Files filters", () => {
		expect(matchesFilter(quilt, "quilts")).toBe(true);
		expect(matchesFilter(plain, "quilts")).toBe(false);
		expect(matchesFilter(encrypted, "encrypted")).toBe(true);
		expect(matchesFilter(expiring, "expiring")).toBe(true);
		// A blob that was never certified is not counted as expiring.
		expect(matchesFilter(registered, "expiring")).toBe(false);
		expect(matchesFilter(expired, "expiring")).toBe(false);
	});
});

describe("matchesSearch", () => {
	const row = blobRow({
		name: "Press-Kit.pdf",
		blobId: "Hs8mKq4dXyZ9vA0",
		objectId: `0x8c41${"0".repeat(56)}2e7b`,
	});

	it("matches the name, blob id or object id, ignoring case", () => {
		expect(matchesSearch(row, "press-kit")).toBe(true);
		expect(matchesSearch(row, "hs8mkq4d")).toBe(true);
		expect(matchesSearch(row, "0X8C41")).toBe(true);
		expect(matchesSearch(row, "2e7b")).toBe(true);
	});

	it("ignores surrounding space, and a blank query matches everything", () => {
		expect(matchesSearch(row, "  kit.pdf ")).toBe(true);
		expect(matchesSearch(row, "   ")).toBe(true);
		expect(matchesSearch(row, "")).toBe(true);
	});

	it("does not match the shortened label of an unnamed blob", () => {
		const unnamed = blobRow({ blobId: "LoFCiFAn9m5X4kwNomSLtZ4q" });
		expect(unnamed.label).toBe("LoFCiFAn…tZ4q");
		expect(matchesSearch(unnamed, "…")).toBe(false);
		expect(matchesSearch(unnamed, "x4kwnom")).toBe(true);
	});

	it("rejects rows that match nothing", () => {
		expect(matchesSearch(row, "archive")).toBe(false);
	});
});

describe("filterRows", () => {
	it("applies the view and the search together", () => {
		const hero = blobRow({ name: "hero.png", isQuilt: true });
		const heroCopy = blobRow({ name: "hero-copy.png" });
		const other = blobRow({ name: "notes.md", isQuilt: true });
		expect(filterRows([hero, heroCopy, other], "quilts", "hero")).toEqual([
			hero,
		]);
		expect(filterRows([hero, heroCopy, other], "all", "HERO")).toEqual([
			hero,
			heroCopy,
		]);
	});
});

describe("Published and Shared", () => {
	const published = blobRow({ name: "morse-note.md" });
	const shared = blobRow({ name: "sealed-note.txt", isEncrypted: true });
	const both = blobRow({ name: "both.md" });
	const neither = blobRow({ name: "plain.txt" });
	const marks: MorseMarks = {
		published: new Set([published.blob.objectId, both.blob.objectId]),
		shared: new Set([shared.blob.objectId, both.blob.objectId]),
	};

	it("follow the Morse marks by object id", () => {
		expect(matchesFilter(published, "published", marks)).toBe(true);
		expect(matchesFilter(shared, "published", marks)).toBe(false);
		expect(matchesFilter(shared, "shared", marks)).toBe(true);
		expect(matchesFilter(neither, "shared", marks)).toBe(false);
		expect(
			filterRows([published, shared, both, neither], "shared", "", marks),
		).toEqual([shared, both]);
	});

	it("list nothing while the marks are unknown", () => {
		expect(matchesFilter(published, "published", NO_MARKS)).toBe(false);
		expect(matchesFilter(shared, "shared")).toBe(false);
		expect(filterRows([published, shared], "published", "")).toEqual([]);
	});
});

describe("filterCounts", () => {
	const quilt = blobRow({ isQuilt: true, endEpoch: 600 });
	const sealed = blobRow({ isEncrypted: true, endEpoch: 600 });
	const expiring = blobRow({ endEpoch: 556 });
	const registered = blobRow({ certifiedEpoch: null, endEpoch: 556 });
	const expired = blobRow({ endEpoch: 474 });
	const rows = [quilt, sealed, expiring, registered, expired];

	it("counts each chip from the listed rows and the Morse marks", () => {
		expect(
			filterCounts(rows, {
				published: new Set([quilt.blob.objectId, expiring.blob.objectId]),
				shared: new Set([sealed.blob.objectId, "0xnot-listed"]),
			}),
		).toEqual({
			all: 5,
			quilts: 1,
			encrypted: 1,
			expiring: 1,
			published: 2,
			shared: 1,
		});
	});

	it("leaves Published and Shared uncounted while their marks are unknown", () => {
		expect(filterCounts(rows, NO_MARKS)).toEqual({
			all: 5,
			quilts: 1,
			encrypted: 1,
			expiring: 1,
			published: null,
			shared: null,
		});
		expect(
			filterCounts(rows, { published: new Set(), shared: null }),
		).toMatchObject({ published: 0, shared: null });
	});

	it("counts zero everywhere for an empty wallet once the marks are known", () => {
		expect(
			filterCounts([], { published: new Set(), shared: new Set() }),
		).toEqual({
			all: 0,
			quilts: 0,
			encrypted: 0,
			expiring: 0,
			published: 0,
			shared: 0,
		});
	});
});
