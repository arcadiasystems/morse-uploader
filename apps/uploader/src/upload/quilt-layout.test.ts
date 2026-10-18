import { encodeQuilt } from "@mysten/walrus";
import { describe, expect, it } from "vitest";
import {
	maxQuiltFiles,
	type QuiltPatchShape,
	quiltLayout,
} from "./quilt-layout";

const SHARDS = 1000;

/** The quilt the SDK builds from the same files, for comparison. */
function sdkQuiltBytes(patches: readonly QuiltPatchShape[]): number {
	return encodeQuilt({
		numShards: SHARDS,
		blobs: patches.map((patch) => ({
			identifier: patch.identifier,
			tags: { ...patch.tags },
			contents: new Uint8Array(patch.contentBytes),
		})),
	}).quilt.length;
}

function shapes(
	files: readonly [identifier: string, bytes: number, type?: string][],
): QuiltPatchShape[] {
	return files.map(([identifier, contentBytes, type]) => ({
		identifier,
		contentBytes,
		tags: type ? { "content-type": type } : {},
	}));
}

describe("quiltLayout", () => {
	it.each([
		[
			"three small files",
			shapes([
				["index.html", 1200, "text/html"],
				["about.html", 900, "text/html"],
				["feed.xml", 3, "text/xml"],
			]),
		],
		["one empty file", shapes([["empty.txt", 0]])],
		[
			"files without tags",
			shapes([
				["a.txt", 10],
				["b/c.txt", 20],
			]),
		],
		[
			"a large file beside small ones",
			shapes([
				["big.bin", 500_000, "application/octet-stream"],
				["s1", 1],
				["s2", 2],
			]),
		],
		[
			"unicode paths",
			shapes([
				["fotografije/Beograd č.jpg", 40_000, "image/jpeg"],
				["名前.txt", 12, "text/plain"],
			]),
		],
		[
			"a hundred files",
			shapes(
				Array.from(
					{ length: 100 },
					(_, index) =>
						[
							`assets/file-${index}.png`,
							1000 + index * 37,
							"image/png",
						] as const,
				),
			),
		],
	])("matches encodeQuilt in @mysten/walrus for %s", (_, patches) => {
		const layout = quiltLayout(patches, SHARDS);
		if (!layout.ok) throw new Error(`unexpected ${layout.problem}`);
		expect(layout.bodyBytes).toBe(sdkQuiltBytes(patches));
		expect(layout.bodyBytes % (334 * 667)).toBe(0);
	});

	it("holds at most 666 files on 1000 shards, as encodeQuilt does", () => {
		expect(maxQuiltFiles(SHARDS)).toBe(666);
		const many = shapes(
			Array.from({ length: 667 }, (_, index) => [`f${index}`, 1] as const),
		);
		expect(quiltLayout(many, SHARDS)).toEqual({
			ok: false,
			problem: "too-many-files",
		});
		expect(() => sdkQuiltBytes(many)).toThrow(/Too many blobs/);
		expect(quiltLayout(many.slice(0, 666), SHARDS).ok).toBe(true);
	});

	it("grows the symbol size so the index of long paths fits in 10 columns, as encodeQuilt does", () => {
		const longPaths = shapes(
			Array.from(
				{ length: 50 },
				(_, index) => [`${"deep/".repeat(2000)}${index}`, 1] as const,
			),
		);
		const layout = quiltLayout(longPaths, SHARDS);
		if (!layout.ok) throw new Error(`unexpected ${layout.problem}`);
		expect(layout.symbolSize).toBeGreaterThan(100);
		expect(layout.bodyBytes).toBe(sdkQuiltBytes(longPaths));
	});
});
