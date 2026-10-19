import { describe, expect, it } from "vitest";
import { type LocalRoot, rootsFromPicked } from "@/local/local-library";
import {
	hasBytes,
	type StagedRoot,
	stagedLibrary,
	stagedTotals,
	stageRoots,
} from "./staged-files";

let next = 0;
function roots(files: Record<string, string>): LocalRoot[] {
	return rootsFromPicked(
		Object.entries(files).map(([path, text]) => ({
			path,
			file: new File([text], path.slice(path.lastIndexOf("/") + 1), {
				lastModified: 1_700_000_000_000,
			}),
		})),
		() => `root-${next++}`,
	);
}

/** A root as it comes back after a reload whose bytes the browser did not keep. */
function withoutBytes(root: LocalRoot): StagedRoot {
	return {
		...root,
		files: root.files.map((file) => ({ ...file, file: null })),
	};
}

describe("stageRoots", () => {
	it("adds drops in order, a folder as one root with its paths", () => {
		const first = roots({ "site/index.html": "<h1>", "site/a/b.txt": "b" });
		const second = roots({ "hero.png": "png" });
		const result = stageRoots(stageRoots([], first).roots, second);
		expect(result.roots.map((root) => [root.kind, root.name])).toEqual([
			["folder", "site"],
			["file", "hero.png"],
		]);
		expect(result.roots[0]?.files.map((file) => file.path)).toEqual([
			"site/a/b.txt",
			"site/index.html",
		]);
		expect(result.added).toEqual(["hero.png"]);
	});

	it("stages the same files once: a second drop of them is skipped", () => {
		const staged = stageRoots([], roots({ "site/index.html": "<h1>" })).roots;
		const again = stageRoots(staged, roots({ "site/index.html": "<h1>" }));
		expect(again.roots).toHaveLength(1);
		expect(again.skipped).toEqual(["site"]);
	});

	it("keeps a folder of the same name with other files as a root of its own", () => {
		const staged = stageRoots([], roots({ "site/index.html": "<h1>" })).roots;
		const other = stageRoots(staged, roots({ "site/about.txt": "about" }));
		expect(other.roots).toHaveLength(2);
		expect(other.added).toEqual(["site"]);
	});

	it("replaces a root that lost its bytes in a reload with the same root staged again", () => {
		const [site] = roots({ "site/index.html": "<h1>" });
		const [hero] = roots({ "hero.png": "png" });
		if (!site || !hero) throw new Error("No roots.");
		const reloaded = [withoutBytes(site), hero];
		const result = stageRoots(reloaded, roots({ "site/index.html": "<h1>" }));
		expect(result.restored).toEqual(["site"]);
		expect(result.roots.map((root) => root.name)).toEqual(["site", "hero.png"]);
		expect(result.roots.every(hasBytes)).toBe(true);
	});
});

describe("staged library and totals", () => {
	it("plans only roots that still have their bytes, and counts everything staged", () => {
		const [site, hero] = roots({
			"site/index.html": "<h1>",
			"hero.png": "png",
		});
		if (!site || !hero) throw new Error("No roots.");
		const staged = [withoutBytes(site), hero];
		expect(stagedLibrary(staged).map((root) => root.name)).toEqual([
			"hero.png",
		]);
		expect(stagedTotals(staged)).toEqual({ items: 2, files: 2, bytes: 7 });
	});
});
