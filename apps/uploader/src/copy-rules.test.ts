import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** The copy rules from the handover: no em dashes, and the production network is "Walrus Mainnet". */
const SOURCE_ROOT = import.meta.dirname;
// Built from its code point so this file holds no em dash either.
const EM_DASH = String.fromCharCode(0x2014);

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts")
			? [path]
			: [];
	});
}

describe("copy rules", () => {
	const files = sourceFiles(SOURCE_ROOT).map((path) => ({
		path: relative(SOURCE_ROOT, path),
		text: readFileSync(path, "utf8"),
	}));

	it("finds the app's sources", () => {
		expect(files.length).toBeGreaterThan(20);
	});

	it("uses no em dashes", () => {
		expect(
			files
				.filter((file) => file.text.includes(EM_DASH))
				.map((file) => file.path),
		).toEqual([]);
	});

	it('never calls the production network "Sui mainnet"', () => {
		expect(
			files
				.filter((file) => /sui mainnet/i.test(file.text))
				.map((file) => file.path),
		).toEqual([]);
	});
});
