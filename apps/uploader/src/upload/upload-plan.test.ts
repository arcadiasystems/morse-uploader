import { describe, expect, it } from "vitest";
import {
	allFiles,
	type LocalLibrary,
	rootsFromPicked,
} from "@/local/local-library";
import {
	blobAttributes,
	buildUploadPlan,
	RELAY_MAX_UPLOAD_BYTES,
	type SealSettings,
	type UploadMode,
} from "./upload-plan";

const SHARDS = 1000;
const SEAL: SealSettings = {
	envelope: { keyServers: 2, identityBytes: 49 },
	policyPackageId:
		"0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0",
};

/** A File that reports `size` without holding that many bytes. */
function fakeFile(name: string, size: number, type = ""): File {
	const file = new File([], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

function library(
	entries: readonly [path: string, size: number, type?: string][],
): LocalLibrary {
	let next = 0;
	return rootsFromPicked(
		entries.map(([path, size, type]) => ({
			path,
			file: fakeFile(path.split("/").at(-1) ?? path, size, type),
		})),
		() => `root-${next++}`,
	);
}

function plan(
	files: LocalLibrary,
	mode: UploadMode,
	seal: SealSettings | null = null,
	selected = new Set(allFiles(files).map((file) => file.id)),
) {
	return buildUploadPlan({
		library: files,
		selected,
		mode,
		seal,
		nShards: SHARDS,
	});
}

const SITE = library([
	["site-export/index.html", 1200, "text/html"],
	["site-export/about.html", 900, "text/html"],
	["site-export/assets/a.png", 4000, "image/png"],
	["site-export/.DS_Store", 6148],
	["hero.png", 1_200_000, "image/png"],
]);

describe("buildUploadPlan", () => {
	it("makes one quilt per dropped folder with paths kept, and a blob per loose file", () => {
		const result = plan(SITE, "quilt");
		expect(result.items.map((item) => [item.kind, item.name])).toEqual([
			["quilt", "site-export"],
			["blob", "hero.png"],
		]);
		const quilt = result.items[0];
		expect(
			quilt?.kind === "quilt" && quilt.patches.map((patch) => patch.identifier),
		).toEqual(["about.html", "assets/a.png", "index.html"]);
		expect(result.folders).toBe(1);
		expect(result.looseFiles).toBe(1);
		expect(result.files).toBe(5);
	});

	it("leaves out a file whose path a quilt cannot hold, and says why", () => {
		const result = plan(SITE, "quilt");
		expect(
			result.leftOut.map((file) => [
				file.quiltName,
				file.identifier,
				file.problem,
			]),
		).toEqual([["site-export", ".DS_Store", "first-character"]]);
		expect(result.problems).toEqual([]);
	});

	it("tags each quilt file with the MIME type the browser reports", () => {
		const quilt = plan(SITE, "quilt").items[0];
		expect(quilt?.kind === "quilt" && quilt.patches[0]?.tags).toEqual({
			"content-type": "text/html",
		});
	});

	it("makes one blob per file in per-file mode, named by its path", () => {
		const result = plan(SITE, "per-file");
		expect(result.items.map((item) => item.name)).toEqual([
			"site-export/.DS_Store",
			"site-export/about.html",
			"site-export/assets/a.png",
			"site-export/index.html",
			"hero.png",
		]);
		expect(result.leftOut).toEqual([]);
	});

	it("encrypts each file on its own, so a folder becomes one blob per file", () => {
		const result = plan(SITE, "quilt", SEAL);
		expect(
			result.items.every((item) => item.kind === "blob" && item.seal !== null),
		).toBe(true);
		expect(result.items).toHaveLength(5);
		const hero = result.items.at(-1);
		// Seal's envelope with two key servers and a 49-byte identity: 365
		// bytes, plus two more for the longer length prefix of 1.2 MB.
		expect(hero?.uploadBytes).toBe(1_200_000 + 367);
	});

	it("plans only what is selected", () => {
		const hero = allFiles(SITE).find((file) => file.path === "hero.png");
		const result = plan(SITE, "quilt", null, new Set(hero ? [hero.id] : []));
		expect(result.items.map((item) => item.name)).toEqual(["hero.png"]);
		expect(result.folders).toBe(0);
	});

	it("refuses a file over the relay's 1 GiB", () => {
		const result = plan(
			library([["huge.iso", RELAY_MAX_UPLOAD_BYTES + 1]]),
			"quilt",
		);
		expect(result.items).toEqual([]);
		expect(result.problems).toEqual([
			{
				kind: "too-large",
				name: "huge.iso",
				bytes: RELAY_MAX_UPLOAD_BYTES + 1,
			},
		]);
	});

	it("refuses a quilt whose padded body is over 1 GiB", () => {
		const result = plan(
			library([
				["big/a.bin", 600_000_000],
				["big/b.bin", 600_000_000],
			]),
			"quilt",
		);
		expect(result.problems).toEqual([
			{ kind: "too-large", name: "big", bytes: expect.any(Number) },
		]);
		const [problem] = result.problems;
		expect(problem?.kind === "too-large" && problem.bytes).toBeGreaterThan(
			RELAY_MAX_UPLOAD_BYTES,
		);
	});

	it("refuses a folder of more than 666 files as one quilt", () => {
		const folder = library(
			Array.from(
				{ length: 667 },
				(_, index) => [`many/f${index}.txt`, 1] as const,
			),
		);
		expect(plan(folder, "quilt").problems).toEqual([
			{ kind: "too-many-files", name: "many", files: 667, limit: 666 },
		]);
		expect(plan(folder, "per-file").problems).toEqual([]);
	});

	it("refuses a folder none of whose files a quilt can hold", () => {
		const folder = library([
			["dots/.a", 1],
			["dots/_b", 1],
		]);
		expect(plan(folder, "quilt").problems).toEqual([
			{ kind: "nothing-left", name: "dots" },
		]);
	});
});

describe("blobAttributes", () => {
	it("names a quilt and marks it as one, as writeFilesFlow does", () => {
		const [quilt] = plan(SITE, "quilt").items;
		expect(quilt && blobAttributes(quilt)).toEqual({
			_walrusBlobType: "quilt",
			name: "site-export",
		});
	});

	it("writes the name and MIME type of a public blob", () => {
		const hero = plan(SITE, "quilt").items[1];
		expect(hero && blobAttributes(hero)).toEqual({
			name: "hero.png",
			"content-type": "image/png",
		});
	});

	it("marks an encrypted blob with the Seal policy package and leaves out its type", () => {
		const hero = plan(SITE, "quilt", SEAL).items.at(-1);
		expect(hero && blobAttributes(hero)).toEqual({
			name: "hero.png",
			seal: SEAL.policyPackageId,
		});
	});
});
