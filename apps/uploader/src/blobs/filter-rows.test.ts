import { describe, expect, it } from "vitest";
import { filterRows, matchesFilter, matchesSearch } from "./filter-rows";
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

	it("sorts blobs into the sidebar views", () => {
		expect(matchesFilter(quilt, "quilts")).toBe(true);
		expect(matchesFilter(plain, "quilts")).toBe(false);
		expect(matchesFilter(encrypted, "encrypted")).toBe(true);
		expect(matchesFilter(expiring, "expiring")).toBe(true);
		// A blob that was never certified is not counted as expiring.
		expect(matchesFilter(registered, "expiring")).toBe(false);
		expect(matchesFilter(expired, "expired")).toBe(true);
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
