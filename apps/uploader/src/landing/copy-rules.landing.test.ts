import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_SOURCES, WALRUS_CLIENTS } from "./walrus-clients";

/**
 * The landing's copy against the handover rules and PROTOCOL-NOTES, on top
 * of the app-wide checks in src/copy-rules.test.ts: the numbers the notes
 * correct, the promises the app cannot keep yet, and a Console card that
 * says only what Console's own docs say and never scores Console.
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

function client(id: (typeof WALRUS_CLIENTS)[number]["id"]) {
	const found = WALRUS_CLIENTS.find((entry) => entry.id === id);
	if (!found) throw new Error(`No ${id} card on the landing`);
	return found;
}

describe("landing copy rules", () => {
	it("reads the page, its components and its styles", () => {
		expect(landingFiles.map((file) => file.path)).toEqual(
			expect.arrayContaining([
				join("landing", "hero.tsx"),
				join("landing", "feature-cards.tsx"),
				join("landing", "walrus-clients.ts"),
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
		// Any mention must carry the limit in the same sentence.
		expect(filesMatching(/auto-extend(?![^.]*while the app is open)/i)).toEqual(
			[],
		);
	});

	it("makes no Seal promise for the uploader, which has Seal per file on Testnet only (section 11, items 14 and 15)", () => {
		const uploader = client("uploader");
		expect(`${uploader.body} ${uploader.bestFor}`).not.toMatch(/Seal/);
	});

	it("advertises nothing the app has not built (items 12 and 19)", () => {
		expect(
			filesMatching(
				// Walrus Sites deploy and agent access over MCP are later phases.
				/Walrus Sites?\b|\bMCP\b|wallet-scoped|revocable/i,
			),
		).toEqual([]);
	});

	it("keeps the Console card to what Console's docs say", () => {
		const consoleCard = client("console");
		expect(consoleCard.body.split(/(?<=\.) /)).toEqual([
			// overview, "Accounts and sign-in"; FAQ, "How do you sign in?"
			"Sign in with Google or Apple.",
			// overview, "Storage limits": "Console manages WAL token handling on your
			// behalf."; storage epochs, "Automatic extension"; overview, "Core
			// concepts": "All folders are private and encrypted with Seal."
			"Console handles WAL and renews storage for you, and keeps every folder private and encrypted with Seal.",
		]);
		expect(consoleCard.action.href).toBe(CONSOLE_SOURCES[0].href);
		expect(CONSOLE_SOURCES.map((source) => source.href)).toEqual([
			"https://docs.wal.app/docs/console/overview",
			"https://docs.wal.app/docs/console/faq",
			"https://docs.wal.app/docs/console/storage-epochs",
		]);
	});

	it("presents Console as a complement, never a rival", () => {
		expect(WALRUS_CLIENTS.map((entry) => entry.id)).toEqual([
			"console",
			"uploader",
		]);
		expect(
			filesMatching(
				/\bvs\.?\s|versus|compared|better than|instead of Console|unlike Console|Console (can't|cannot|doesn't|does not|only)/i,
			),
		).toEqual([]);
	});

	it("drops the Console claims the notes leave unconfirmed (section 13, items 19 and 20)", () => {
		expect(filesMatching(/Not in scope|No publishing/i)).toEqual([]);
	});
});
