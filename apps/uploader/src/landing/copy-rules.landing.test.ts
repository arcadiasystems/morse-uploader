import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS, CONSOLE_SOURCES } from "./comparison";

/**
 * The landing's copy against the handover rules and PROTOCOL-NOTES, on top
 * of the app-wide checks in src/copy-rules.test.ts: the numbers the notes
 * correct, the promises the app cannot keep yet, and a Console column that
 * says only what Console's own docs say.
 */
const SOURCE_ROOT = join(import.meta.dirname, "..");
// Built from its code point so this file holds no em dash either.
const EM_DASH = String.fromCharCode(0x2014);

const landingFiles = [
	...readdirSync(import.meta.dirname)
		.filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"))
		.map((name) => join("landing", name)),
	join("app", "page.tsx"),
	join("styles", "landing.css"),
].map((path) => ({
	path,
	// JSX wraps long copy over lines, so whitespace is folded before matching.
	text: readFileSync(join(SOURCE_ROOT, path), "utf8").replace(/\s+/g, " "),
}));
const copy = landingFiles.map((file) => file.text).join("\n");

function filesMatching(pattern: RegExp): string[] {
	return landingFiles
		.filter((file) => pattern.test(file.text))
		.map((file) => file.path);
}

describe("landing copy rules", () => {
	it("reads the page, its components and its styles", () => {
		expect(landingFiles.map((file) => file.path)).toEqual(
			expect.arrayContaining([
				join("landing", "hero.tsx"),
				join("landing", "feature-cards.tsx"),
				join("landing", "comparison.ts"),
				join("app", "page.tsx"),
				join("styles", "landing.css"),
			]),
		);
	});

	it("uses no em dashes and names the networks Walrus Mainnet and Testnet", () => {
		expect(filesMatching(new RegExp(EM_DASH))).toEqual([]);
		expect(filesMatching(/sui mainnet/i)).toEqual([]);
		expect(filesMatching(/Walrus (mainnet|testnet)\b/)).toEqual([]);
	});

	it("states the browser limit and drops the design's numbers (section 13, items 1 and 2)", () => {
		expect(copy).toContain("Up to 1 GiB per file in the browser");
		expect(filesMatching(/13 GiB|4\.8x/)).toEqual([]);
	});

	it("never promises fewer than two signatures per upload (section 6, item 8)", () => {
		expect(copy).toContain("your wallet signs at least twice per upload");
		expect(
			filesMatching(
				/sign(s|ed)? once per (blob|upload|batch)|one signature|single signature|signs the batch/i,
			),
		).toEqual([]);
	});

	it("says auto-extend runs only while the app is open (section 9, item 13)", () => {
		const mentions = COMPARISON_ROWS.filter((row) =>
			/auto-extend/i.test(row.uploader),
		);
		expect(mentions.length).toBeGreaterThan(0);
		for (const row of mentions)
			expect(row.uploader).toContain("while the app is open");
	});

	it("offers Seal per file and on Testnet only (section 11, items 14 and 15)", () => {
		const mentions = COMPARISON_ROWS.filter((row) => /Seal/.test(row.uploader));
		expect(mentions.length).toBeGreaterThan(0);
		for (const row of mentions)
			expect(row.uploader).toMatch(/per file on Testnet/);
	});

	it("advertises nothing the app has not built (items 12 and 19)", () => {
		expect(
			filesMatching(
				// Walrus Sites deploy, agent access over MCP and the staging tray are later phases.
				/Walrus Sites?\b|\bMCP\b|wallet-scoped|revocable|staging tray|in a tray/i,
			),
		).toEqual([]);
	});

	it("keeps the Console column to what Console's docs say", () => {
		expect(COMPARISON_ROWS.map((row) => [row.topic, row.console])).toEqual([
			// overview, "Accounts and sign-in"; FAQ, "How do you sign in?"
			["Login", "Google or Apple account"],
			// overview, "Storage limits": "Console manages WAL token handling on your behalf."
			["Keys and payment", "Console manages WAL for you"],
			// overview, "Storage limits"; FAQ, "What are the storage limits?"
			["Limits", "5 GB per space, 5 folders, 100 MiB per upload"],
			// overview, "Core concepts": "All folders are private and encrypted with Seal."
			["Folders", "Encrypted private folders"],
			// storage epochs, "Automatic extension"
			["Expiry", "Auto-extended by Console"],
			// overview, "Core concepts": "you upload a file, then poll its status"
			["Verification", "Upload status polling"],
			// FAQ, "Can Walrus Console see files you already uploaded with the Walrus CLI or SDK?"
			["Existing blobs", "Only files uploaded through Console"],
		]);
		expect(CONSOLE_SOURCES.map((source) => source.href)).toEqual([
			"https://docs.wal.app/docs/console/overview",
			"https://docs.wal.app/docs/console/faq",
			"https://docs.wal.app/docs/console/storage-epochs",
		]);
	});

	it("drops the Console claims the notes leave unconfirmed (section 13, items 19 and 20)", () => {
		expect(filesMatching(/Not in scope|No publishing/i)).toEqual([]);
		expect(COMPARISON_ROWS.map((row) => row.topic)).not.toContain("Agents");
		expect(COMPARISON_ROWS.map((row) => row.topic)).not.toContain("Publishing");
	});
});
