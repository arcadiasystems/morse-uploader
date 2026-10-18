import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The copy rules from the handover and PROTOCOL-NOTES section 13: no em
 * dashes, and the networks are "Walrus Mainnet" and "Testnet", never
 * "Sui mainnet" or a lower-case "Walrus mainnet" / "Walrus testnet".
 */
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

	it("capitalizes the network names after Walrus", () => {
		expect(
			files
				.filter((file) => /Walrus (mainnet|testnet)\b/.test(file.text))
				.map((file) => file.path),
		).toEqual([]);
	});

	it("says an expired blob keeps its record on Sui, as the notes confirm", () => {
		const row = files.find((file) => file.path.endsWith("files/file-row.tsx"));
		expect(row?.text).toContain('"record stays on Sui"');
	});

	it("drops the design's claims the notes correct (PROTOCOL-NOTES section 13)", () => {
		const stale = [
			/13 GiB/, // items 1: the browser limit is 1 GiB per upload
			/4\.8x/, // item 2: encoding is about 4.49x plus 64 MB per blob
			/publisher timeout/i, // item 10: it is the upload relay
			/[Bb]atching with one signature/, // item 8: never below N + 1
			/frees storage/, // item 16: storage returns to the wallet
			/\b\d+ storage nodes\b/, // item 11: the SDK reports no node count
			/per year at today's price/, // items 5 and 6: periods are epochs within 53
			/auto-extend from your wallet/i, // item 13: no background extend
		];
		expect(
			files
				.filter((file) => stale.some((claim) => claim.test(file.text)))
				.map((file) => file.path),
		).toEqual([]);
	});

	it("uses the notes' wording for limits, cost and signatures", () => {
		const text = (suffix: string) =>
			files.find((file) => file.path.endsWith(suffix))?.text ?? "";
		// Item 1: the Overview's drop zone. JSX wraps long copy over lines.
		const drop = text("overview/drop-card.tsx").replace(/\s+/g, " ");
		expect(drop).toContain(
			"Folders keep their structure and upload as one quilt of up to 666 files.",
		);
		expect(drop).toContain("Up to 1 GiB per upload.");
		const sheet = text("upload-sheet/upload-sheet.tsx");
		// Items 2, 7, 8 and 14.
		expect(sheet).toContain("Each blob carries 64 MB of fixed metadata.");
		expect(sheet).toContain("Relay tip (SUI)");
		expect(sheet).toContain("Network fees (SUI)");
		expect(sheet).toContain(
			"Your wallet asks once per item to register and once to certify the batch",
		);
		expect(sheet).toContain(
			"Client-side. Only wallets you allow can decrypt. The blob id, file name and size stay public.",
		);
	});

	it("uses the notes' wording in the blob drawer (items 11, 12, 13 and 16)", () => {
		// JSX wraps long copy over lines, so whitespace is folded before matching.
		const text = (suffix: string) =>
			(files.find((file) => file.path.endsWith(suffix))?.text ?? "").replace(
				/\s+/g,
				" ",
			);
		// Item 11: verify says what happened, never a node count.
		expect(text("drawer/verify-section.tsx")).toContain(
			"Bytes match the blob id. Rebuilt from storage nodes",
		);
		// Item 16: delete returns a Storage object; no WAL comes back.
		const remove = text("drawer/delete-section.tsx");
		expect(remove).toContain("returns its storage to your wallet");
		expect(remove).toContain("No WAL is refunded.");
		// Item 13 and section 9: auto-extend only runs while the app is open.
		expect(text("drawer/auto-extend-panel.tsx")).toContain(
			"Auto-extend runs while Morse Uploader is open. It asks your wallet to sign one transaction for all blobs that are close to expiry and never spends more than your WAL cap.",
		);
		// Item 12: a blob has no Walrus Site link, and the drawer says so.
		expect(text("drawer/share-section.tsx")).toContain("No Walrus Site link");
		// Item 5: the end is an epoch, with days as an estimate. Storage is
		// valid while epoch < end_epoch (section 5), so it runs until that epoch starts.
		expect(text("drawer/storage-section.tsx")).toContain(
			"Paid until epoch {blob.endEpoch} starts",
		);
	});

	it("names the register step between encode and upload (item 9)", () => {
		const state = files.find((file) =>
			file.path.endsWith("transfers/transfer-state.ts"),
		);
		const steps = /export type TransferStep =([^;]+);/.exec(state?.text ?? "");
		expect(steps?.[1]?.match(/"(\w+)"/g)).toEqual([
			'"encode"',
			'"register"',
			'"upload"',
			'"certify"',
			'"record"',
		]);
	});
});
