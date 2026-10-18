import { describe, expect, it } from "vitest";
import {
	addRoots,
	allFiles,
	pathInFolder,
	removeFiles,
	rootsFromPicked,
} from "./local-library";
import { buildLocalRows, selectionOf, setSelected } from "./local-tree";

function picked(paths: readonly string[]) {
	return paths.map((path) => ({
		path,
		file: new File(["abc"], path.split("/").at(-1) ?? path),
	}));
}

function ids() {
	let next = 0;
	return () => `root-${next++}`;
}

describe("rootsFromPicked", () => {
	it("groups files by their dropped folder and keeps loose files apart, in drop order", () => {
		const roots = rootsFromPicked(
			picked([
				"/site/b.txt",
				"hero.png",
				"/site/assets/a.png",
				"site/index.html",
			]),
			ids(),
		);
		expect(roots.map((root) => [root.kind, root.name])).toEqual([
			["folder", "site"],
			["file", "hero.png"],
		]);
		expect(roots[0]?.files.map((file) => file.path)).toEqual([
			"site/assets/a.png",
			"site/b.txt",
			"site/index.html",
		]);
	});

	it("keeps paths relative to the dropped folder", () => {
		const [site] = rootsFromPicked(picked(["site/assets/a.png"]), ids());
		const [file] = site?.files ?? [];
		expect(file && pathInFolder(file)).toBe("assets/a.png");
		expect(file?.name).toBe("a.png");
	});
});

describe("addRoots and removeFiles", () => {
	it("replaces a folder dropped again instead of listing it twice", () => {
		const first = rootsFromPicked(picked(["site/a.txt"]), () => "old");
		const again = rootsFromPicked(
			picked(["site/a.txt", "site/b.txt"]),
			() => "new",
		);
		const library = addRoots(first, again);
		expect(library.map((root) => root.id)).toEqual(["new"]);
		expect(allFiles(library)).toHaveLength(2);
	});

	it("removes files, and a folder left empty", () => {
		const library = rootsFromPicked(
			picked(["site/a.txt", "site/b.txt", "c.txt"]),
			ids(),
		);
		const site = library[0];
		const [a, b] = site?.files ?? [];
		if (!a || !b) throw new Error("no files");
		expect(
			allFiles(removeFiles(library, new Set([a.id]))).map((file) => file.path),
		).toEqual(["site/b.txt", "c.txt"]);
		expect(
			removeFiles(library, new Set([a.id, b.id])).map((root) => root.name),
		).toEqual(["c.txt"]);
	});
});

describe("buildLocalRows", () => {
	const library = rootsFromPicked(
		picked([
			"site/index.html",
			"site/assets/b.png",
			"site/assets/a.png",
			"notes.md",
		]),
		ids(),
	);

	it("shows folders closed, with every file under them and their total size", () => {
		const rows = buildLocalRows(library, new Set());
		expect(
			rows.map((row) =>
				row.kind === "folder" ? `${row.name}/` : row.file.name,
			),
		).toEqual(["site/", "notes.md"]);
		const [site] = rows;
		expect(site?.kind === "folder" && [site.fileIds.length, site.size]).toEqual(
			[3, 9],
		);
	});

	it("opens folders to subfolders first, then files, in natural order", () => {
		const site = library[0]?.id;
		const rows = buildLocalRows(
			library,
			new Set([`${site}:site/`, `${site}:site/assets/`]),
		);
		expect(
			rows.map((row) => [
				row.depth,
				row.kind === "folder" ? `${row.name}/` : row.file.name,
			]),
		).toEqual([
			[0, "site/"],
			[1, "assets/"],
			[2, "a.png"],
			[2, "b.png"],
			[1, "index.html"],
			[0, "notes.md"],
		]);
	});
});

describe("selection", () => {
	it("selects and clears files together, and reports a folder as all, some or none", () => {
		const some = setSelected(new Set(), ["a", "b"], true);
		expect(selectionOf(["a", "b", "c"], some)).toBe("some");
		expect(selectionOf(["a", "b"], some)).toBe("all");
		expect(selectionOf(["c"], some)).toBe("none");
		expect([...setSelected(some, ["a"], false)]).toEqual(["b"]);
	});
});
