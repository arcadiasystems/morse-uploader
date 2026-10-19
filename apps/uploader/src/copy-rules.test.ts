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

const files = sourceFiles(SOURCE_ROOT).map((path) => ({
	path: relative(SOURCE_ROOT, path),
	text: readFileSync(path, "utf8"),
}));

describe("copy rules", () => {
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
			// The v2 design reuses v1's samples; R1 drops what cannot be true.
			/\+1 year/, // item 6: a year cannot be bought on Testnet
			/GB·yr/, // item 6: prices are per epoch, not per year
			/\b(798|306) days?\b|epoch 798/, // item 5: unreachable sample epochs
			/extended this month/i, // chain keeps no extend history per blob
			/via MCP/, // agents are not built
			/Open Morse Press/, // no address to link to
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
		// R3 makes the design's headline true: drops land anywhere and stage first.
		expect(drop).toContain("Drop anything, anywhere");
		expect(drop).toContain("They stage first; nothing is sent until you sign.");
		// Items 2 and 7: the staging tray's itemised cost.
		const cost = text("staging/cost-list.tsx");
		expect(cost).toContain("Each blob carries 64 MB of fixed metadata.");
		expect(cost).toContain("Relay tip (SUI)");
		expect(cost).toContain("Network fees (SUI)");
		// Item 8: how the signatures come, under Sign and send.
		expect(text("staging/sign-help.ts")).toContain(
			"Your wallet asks once per item to register and once to certify the batch",
		);
		// Item 14: what Seal keeps private, and what stays public.
		expect(text("staging/tray-settings.tsx")).toContain(
			"Client-side. Only wallets you allow can decrypt. The blob id, file name and size stay public.",
		);
	});

	it("uses the notes' wording in the inspector (items 11, 12, 13 and 16)", () => {
		// JSX wraps long copy over lines, so whitespace is folded before matching.
		const text = (suffix: string) =>
			(files.find((file) => file.path.endsWith(suffix))?.text ?? "").replace(
				/\s+/g,
				" ",
			);
		// Item 11: verify says what happened, never a node count.
		expect(text("inspector/verify-section.tsx")).toContain(
			"Bytes match the blob id. Rebuilt from storage nodes",
		);
		// Item 16: delete returns a Storage object; no WAL comes back.
		const remove = text("inspector/delete-section.tsx");
		expect(remove).toContain("returns its storage to your wallet");
		expect(remove).toContain("No WAL is refunded.");
		// Item 13 and section 9: auto-extend only runs while the app is open.
		expect(text("inspector/auto-extend-panel.tsx")).toContain(
			"Auto-extend runs while Morse Uploader is open. It asks your wallet to sign one transaction for all blobs that are close to expiry and never spends more than your WAL cap.",
		);
		// Item 12: a blob has no Walrus Site link, and the inspector says so.
		expect(text("inspector/share-section.tsx")).toContain(
			"No Walrus Site link",
		);
		// Item 5: the end is an epoch, with days as an estimate. Storage is
		// valid while epoch < end_epoch (section 5), so it runs until that epoch starts.
		expect(text("inspector/storage-section.tsx")).toContain(
			"Paid until epoch {blob.endEpoch} starts",
		);
	});

	it("words the Overview by epochs and says where its numbers come from", () => {
		const text = (suffix: string) =>
			(files.find((file) => file.path.endsWith(suffix))?.text ?? "").replace(
				/\s+/g,
				" ",
			);
		const overview = text("overview/overview.tsx");
		// Item 5: storage is paid until an epoch starts; days are an estimate.
		expect(overview).toContain("Every stored blob is paid until epoch");
		expect(overview).toContain("starts, about");
		// Prices are read live, per epoch, never per year.
		expect(overview).toContain("WAL / GiB·epoch");
		expect(overview).toContain("From the Walrus system object.");
		expect(text("overview/expiry-timeline-card.tsx")).toContain(
			"Dates are estimates from the epoch length.",
		);
		// Item 17 holds in the Files rows: an expired blob keeps its record.
		expect(text("files/file-row.tsx")).toContain("record stays on Sui");
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

	it("words drop anywhere, the tray and the transfers slide-over by the notes (items 4, 8, 9 and 10)", () => {
		const text = (suffix: string) =>
			(files.find((file) => file.path.endsWith(suffix))?.text ?? "").replace(
				/\s+/g,
				" ",
			);
		// The drop state as the design words it: drops stage, nothing uploads.
		const overlay = text("drop/drop-overlay.tsx");
		expect(overlay).toContain("Drop to stage");
		expect(overlay).toContain(
			"Folders keep their paths and become quilts. Nothing uploads until you sign.",
		);
		// One button with the real signature count, and prices from chain.
		const tray = text("staging/staging-tray.tsx");
		// The label is a template: "Sign and send · " then the computed count.
		expect(tray).toContain("`Sign and send · $");
		expect(tray).toContain("Price read from the Walrus system object");
		// Item 4: Testnet offers what fits in 53 one-day epochs, Max included.
		const periods = text("upload/periods.ts");
		expect(periods).toContain('{ id: "7d", label: "7 days", days: 7 }');
		expect(periods).toContain('{ id: "max", label: "Max", days: null }');
		// Item 9: five segments, the register step between encode and upload.
		expect(text("transfers/transfer-view.ts")).toContain(
			'"encode", "register", "upload", "certify", "record", ] as const',
		);
		// Item 10: the relay times out, not a publisher.
		expect(text("transfers/transfer-queue.ts")).toContain(
			"The upload relay timed out.",
		);
		// Items 6 and 8: no year on Testnet, no single-signature batching.
		expect(
			files
				.filter((file) => /(^|\/)(staging|drop|transfers)\//.test(file.path))
				.filter((file) =>
					/\bsign once\b|one signature for (all|everything)/i.test(file.text),
				)
				.map((file) => file.path),
		).toEqual([]);
	});

	it("words the bulk bar and the palette by the notes (items 6, 11, 12 and 16)", () => {
		const text = (suffix: string) =>
			(files.find((file) => file.path.endsWith(suffix))?.text ?? "").replace(
				/\s+/g,
				" ",
			);
		// Item 16: a bulk delete returns Storage objects; no WAL comes back.
		const remove = text("bulk/bulk-delete-sheet.tsx");
		expect(remove).toContain("returns their storage to your wallet");
		expect(remove).toContain("No WAL is refunded.");
		// Item 12: Walrus Sites deploy is not built, and the inspector says so.
		expect(text("inspector/publish-section.tsx")).toContain(
			"Walrus Sites deploy is coming",
		);
		// Item 11: bulk verify says what happens, never how many nodes answered.
		const verify = text("bulk/bulk-verify-sheet.tsx");
		expect(verify).toContain("rebuilt from storage nodes");
		expect(verify).not.toMatch(/\b\d+ storage nodes\b/);
		// Item 6: extends are bought in epochs within 53, never by the year.
		const palette = text("palette/palette-commands.tsx");
		expect(palette).toContain("by 1 epoch");
		expect(
			files
				.filter((file) => /(^|\/)(bulk|palette)\//.test(file.path))
				.filter((file) => /\b1 year\b/i.test(file.text))
				.map((file) => file.path),
		).toEqual([]);
	});
});

/**
 * The palette rules from the handover of 2026-10-19: Morse ultramarine and
 * its lift, and nothing else. The old violet, cyan and pink, their glows and
 * the old status colours stay out, and so do gradient fills and gradient
 * text; a gradient may only tint glass, with every colour translucent.
 */
const OLD_PALETTE: readonly (readonly [number, number, number])[] = [
	[179, 136, 255], // violet
	[125, 243, 232], // cyan
	[246, 168, 230], // pink
	[91, 63, 216], // the violet glow
	[27, 167, 155], // the teal glow
	[125, 243, 163], // the old green
	[240, 198, 106], // the old amber
	[255, 138, 138], // the old red
];

/** A colour as hex or as the start of rgb() or rgba(), in any case and spacing. */
function colourPattern([red, green, blue]: readonly [
	number,
	number,
	number,
]): RegExp {
	const hex = [red, green, blue]
		.map((channel) => channel.toString(16).padStart(2, "0"))
		.join("");
	return new RegExp(
		`#${hex}|rgba?\\(\\s*${red}\\s*,\\s*${green}\\s*,\\s*${blue}\\b`,
		"i",
	);
}

/**
 * Each linear or radial gradient in `text`, with its arguments. Conic
 * gradients draw pies with hard stops (the transfers ring), not blends.
 */
function gradients(text: string): string[] {
	return [...text.matchAll(/(?:repeating-)?(?:linear|radial)-gradient\(/g)].map(
		(match) => {
			let depth = 1;
			let end = match.index + match[0].length;
			for (; depth > 0 && end < text.length; end++) {
				if (text[end] === "(") depth++;
				else if (text[end] === ")") depth--;
			}
			return text.slice(match.index, end);
		},
	);
}

const GRADIENT_COLOUR =
	/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|var\(--[\w-]+\)|\btransparent\b/gi;

function isTranslucent(colour: string): boolean {
	return (
		/^transparent$/i.test(colour) ||
		/^rgba\([^)]*,\s*0?\.\d+\s*\)$/.test(colour)
	);
}

describe("palette rules", () => {
	it("holds the handover's accent and status colours in the tokens", () => {
		const base = files.find((file) => file.path.endsWith("styles/base.css"));
		for (const token of [
			"--accent: #2b3be0;",
			"--accent-lift: #7d8bff;",
			"--ok: #6fd3a6;",
			"--warn: #e0b55a;",
			"--err: #f08a8a;",
		])
			expect(base?.text).toContain(token);
	});

	it("keeps every colour of the old palette out", () => {
		const patterns = OLD_PALETTE.map(colourPattern);
		expect(
			files
				.filter((file) => patterns.some((pattern) => pattern.test(file.text)))
				.map((file) => file.path),
		).toEqual([]);
	});

	it("names no token or class after the old palette", () => {
		expect(
			files
				.filter((file) =>
					/\b(cyan|violet|pink|teal)\b|--grad\b/i.test(file.text),
				)
				.map((file) => file.path),
		).toEqual([]);
	});

	it("fills nothing with a gradient and sets no gradient text", () => {
		const blends = files.flatMap((file) =>
			gradients(file.text)
				.filter((gradient) => {
					const colours = gradient.match(GRADIENT_COLOUR) ?? [];
					return new Set(colours).size > 1 && !colours.every(isTranslucent);
				})
				.map((gradient) => `${file.path}: ${gradient}`),
		);
		expect(blends).toEqual([]);
		expect(
			files
				.filter((file) => /background-clip:\s*text/.test(file.text))
				.map((file) => file.path),
		).toEqual([]);
	});
});
