import { describe, expect, it } from "vitest";
import { blobRow } from "@/blobs/fixtures";
import {
	MAX_BLOB_RESULTS,
	matchBlobs,
	matchScore,
	type PaletteEntry,
	rankEntries,
} from "./palette-match";

describe("matchScore", () => {
	const text = "Extend everything expiring";

	it("ranks a prefix of the whole text above a word start, above a fragment", () => {
		const prefix = matchScore("ext", text);
		const wordStart = matchScore("ever", text);
		const inside = matchScore("thing", text);
		expect(prefix).not.toBeNull();
		expect(wordStart).not.toBeNull();
		expect(inside).not.toBeNull();
		expect(prefix as number).toBeGreaterThan(wordStart as number);
		expect(wordStart as number).toBeGreaterThan(inside as number);
	});

	it("needs every word of the query, in any order", () => {
		expect(matchScore("expiring extend", text)).not.toBeNull();
		expect(matchScore("extend upload", text)).toBeNull();
	});

	it("ignores case and surrounding space, and matches anything when empty", () => {
		expect(matchScore("  EXTEND ", text)).toBe(matchScore("extend", text));
		expect(matchScore("", text)).toBe(0);
		expect(matchScore("   ", text)).toBe(0);
	});
});

describe("rankEntries", () => {
	const entries: PaletteEntry[] = [
		{
			id: "auto",
			group: "actions",
			title: "Turn on auto-extend",
			keywords: ["renew", "cap"],
		},
		{
			id: "expiring",
			group: "actions",
			title: "Extend everything expiring in 30 days",
			keywords: ["renew"],
		},
		{ id: "overview", group: "goto", title: "Overview", keywords: ["home"] },
		{ id: "files", group: "goto", title: "Files", keywords: ["blobs"] },
	];
	const ids = (query: string) =>
		rankEntries(query, entries).map((entry) => entry.id);

	it("puts the best match first", () => {
		expect(ids("extend")).toEqual(["expiring", "auto"]);
	});

	it("keeps the given order for ties and for an empty field", () => {
		expect(ids("renew")).toEqual(["auto", "expiring"]);
		expect(ids("")).toEqual(["auto", "expiring", "overview", "files"]);
	});

	it("matches keywords as well as titles", () => {
		expect(ids("home")).toEqual(["overview"]);
		expect(ids("blobs")).toEqual(["files"]);
	});

	it("drops what does not match", () => {
		expect(ids("zebra")).toEqual([]);
	});
});

describe("matchBlobs", () => {
	const press = blobRow({
		name: "press-kit.pdf",
		blobId: "Hs8mKq4dQ1x9vA0",
		objectId: `0x${"c0ffee".padEnd(64, "1")}`,
		endEpoch: 577,
	});
	const photo = blobRow({
		name: "photo-4121.jpg",
		blobId: "Pq1z8hT3k2u6Yc",
		objectId: `0x${"beef".padEnd(64, "2")}`,
		endEpoch: 560,
	});
	const soon = blobRow({
		name: "notes.md",
		blobId: "Zk2p9aQ1r4Vn",
		objectId: `0x${"d00d".padEnd(64, "3")}`,
		endEpoch: 555,
	});
	const unnamed = blobRow({
		name: null,
		blobId: "Mm77LongIdAbc",
		objectId: `0x${"abad".padEnd(64, "4")}`,
		endEpoch: 603,
	});
	const rows = [press, photo, soon, unnamed];
	const named = (query: string) =>
		matchBlobs(query, rows).map((match) => match.row.blob.name);

	it("finds a blob by its name", () => {
		expect(named("press")).toEqual(["press-kit.pdf"]);
		expect(named("4121")).toEqual(["photo-4121.jpg"]);
	});

	it("finds a blob by a blob id prefix or fragment", () => {
		expect(matchBlobs("Hs8mKq", rows).map((match) => match.row)).toEqual([
			press,
		]);
		expect(matchBlobs("LongId", rows).map((match) => match.row)).toEqual([
			unnamed,
		]);
	});

	it("finds a blob by its object id, with or without 0x", () => {
		expect(matchBlobs("0xc0ffee", rows).map((match) => match.row)).toEqual([
			press,
		]);
		expect(matchBlobs("c0ffee", rows).map((match) => match.row)).toEqual([
			press,
		]);
		expect(matchBlobs("0xBEEF", rows).map((match) => match.row)).toEqual([
			photo,
		]);
	});

	it("ignores id fragments shorter than four characters", () => {
		expect(matchBlobs("Hs8", rows)).toEqual([]);
		expect(matchBlobs("0xc0f", rows)).toEqual([]);
	});

	it("lists at most the limit", () => {
		const many = Array.from({ length: 10 }, (_, index) =>
			blobRow({ name: `report-${index}.pdf` }),
		);
		expect(matchBlobs("report", many)).toHaveLength(MAX_BLOB_RESULTS);
		expect(matchBlobs("report", many, 3)).toHaveLength(3);
	});

	it("lists the blobs expiring soonest for a query about extending", () => {
		for (const query of ["extend", "expir", "renew"]) {
			const matches = matchBlobs(query, rows);
			expect(matches.map((match) => match.reason)).toEqual([
				"expiring",
				"expiring",
				"expiring",
			]);
			expect(matches.map((match) => match.row)).toEqual([soon, photo, press]);
		}
	});

	it("returns nothing for an empty or unrelated query", () => {
		expect(matchBlobs("", rows)).toEqual([]);
		expect(matchBlobs("zebra", rows)).toEqual([]);
	});
});
