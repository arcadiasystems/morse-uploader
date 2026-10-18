import { describe, expect, it } from "vitest";
import {
	assignIdentifiers,
	identifierProblem,
	quiltIdentifier,
} from "./quilt-identifier";

describe("quiltIdentifier", () => {
	it("keeps the path inside the folder with its slashes", () => {
		expect(quiltIdentifier("assets/img/a.png")).toBe("assets/img/a.png");
	});

	it("drops a leading ./ or /", () => {
		expect(quiltIdentifier("./index.html")).toBe("index.html");
		expect(quiltIdentifier("/index.html")).toBe("index.html");
	});

	it("NFC-normalizes names, as macOS often stores them decomposed", () => {
		const decomposed = "c\u030C.txt";
		expect(quiltIdentifier(decomposed)).toBe("\u010D.txt");
	});
});

describe("identifierProblem", () => {
	it.each([
		["index.html", null],
		["assets/a.png", null],
		["2026/report.pdf", null],
		["a_test", null],
		["a-test", null],
		["a.test", null],
		["", "empty"],
		[".well-known/x", "first-character"],
		["_next/static/app.js", "first-character"],
		[".DS_Store", "first-character"],
		["notes.md ", "trailing-whitespace"],
		["drafts /a.md", "trailing-whitespace"],
		["a\tb.txt", "control-character"],
		["a\u0085b.txt", "control-character"],
		["a\u007fb", "control-character"],
	])("%j breaks %j", (identifier, problem) => {
		expect(identifierProblem(identifier)).toBe(problem);
	});

	it("measures the 65,535 limit in UTF-8 bytes, not characters", () => {
		expect(identifierProblem(`a${"b".repeat(65_534)}`)).toBeNull();
		expect(identifierProblem(`a${"b".repeat(65_535)}`)).toBe("too-long");
		// 21,845 three-byte characters plus "a" is 65,536 bytes.
		expect(identifierProblem(`a${"名".repeat(21_845)}`)).toBe("too-long");
	});
});

describe("assignIdentifiers", () => {
	it("maps folder paths and leaves out files a quilt cannot hold", () => {
		const { accepted, rejected } = assignIdentifiers([
			{ item: 1, pathInFolder: "index.html" },
			{ item: 2, pathInFolder: ".DS_Store" },
			{ item: 3, pathInFolder: "assets/a.png" },
		]);
		expect(accepted).toEqual([
			{ item: 1, identifier: "index.html" },
			{ item: 3, identifier: "assets/a.png" },
		]);
		expect(rejected).toEqual([
			{ item: 2, identifier: ".DS_Store", problem: "first-character" },
		]);
	});

	it("keeps the first of two paths that are equal after normalization", () => {
		const { accepted, rejected } = assignIdentifiers([
			{ item: "composed", pathInFolder: "notes/\u010D.txt" },
			{ item: "decomposed", pathInFolder: "notes/c\u030C.txt" },
		]);
		expect(accepted).toEqual([
			{ item: "composed", identifier: "notes/\u010D.txt" },
		]);
		expect(rejected).toEqual([
			{
				item: "decomposed",
				identifier: "notes/\u010D.txt",
				problem: "duplicate",
			},
		]);
	});
});
