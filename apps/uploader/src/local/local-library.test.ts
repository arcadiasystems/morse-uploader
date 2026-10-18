import { describe, expect, it } from "vitest";
import { allFiles, pathInFolder, rootsFromPicked } from "./local-library";

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

	it("lists every file of every root", () => {
		const library = rootsFromPicked(
			picked(["site/a.txt", "site/b.txt", "c.txt"]),
			ids(),
		);
		expect(allFiles(library).map((file) => file.path)).toEqual([
			"site/a.txt",
			"site/b.txt",
			"c.txt",
		]);
	});
});
