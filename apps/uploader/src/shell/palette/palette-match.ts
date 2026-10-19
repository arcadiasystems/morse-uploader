import type { BlobRow } from "@/blobs/blob-row";

/**
 * Matching and ranking for the command palette (design/v2/app-palette.html):
 * one field for actions, places and blobs. Pure, so the order a query
 * gives is tested without the page.
 */

export type PaletteGroup = "actions" | "goto" | "blobs";

/** The groups in the order the palette shows them. */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
	"actions",
	"goto",
	"blobs",
];

/** A command as the palette ranks it: what it says, and other words it answers to. */
export interface PaletteEntry {
	id: string;
	group: Exclude<PaletteGroup, "blobs">;
	title: string;
	keywords: readonly string[];
}

/** Blobs listed for one query, at most. */
export const MAX_BLOB_RESULTS = 6;

/** Queries about storage running out list the blobs expiring soonest. */
const EXTEND_INTENT = /^(ext|exp|ren|sto)/;

const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");

/**
 * How well `query` matches `text`: higher is better, `null` is no match.
 * Every word of the query must start a word of the text, or failing that
 * appear inside the text. A whole-text prefix ranks first, then words that
 * start text words, then ones found inside.
 */
export function matchScore(query: string, text: string): number | null {
	const needle = query.trim().toLowerCase();
	if (needle === "") return 0;
	const haystack = text.toLowerCase();
	if (haystack.startsWith(needle))
		return 100 - Math.min(50, haystack.length / 10);
	const textWords = words(text);
	let score = 60;
	for (const word of words(needle)) {
		if (textWords.some((candidate) => candidate.startsWith(word))) continue;
		if (haystack.includes(word)) {
			score -= 15;
			continue;
		}
		return null;
	}
	return score;
}

/** A command's best score over its title and keywords; the title counts a little more. */
function entryScore(query: string, entry: PaletteEntry): number | null {
	const scores = [
		matchScore(query, entry.title),
		...entry.keywords.map((keyword) => {
			const score = matchScore(query, keyword);
			return score === null ? null : score - 5;
		}),
	].filter((score): score is number => score !== null);
	return scores.length === 0 ? null : Math.max(...scores);
}

/**
 * The commands that match, best first; ties keep the given order, which is
 * the order the palette lists them in when the field is empty.
 */
export function rankEntries(
	query: string,
	entries: readonly PaletteEntry[],
): PaletteEntry[] {
	return entries
		.map((entry, index) => ({ entry, index, score: entryScore(query, entry) }))
		.filter(
			(candidate): candidate is typeof candidate & { score: number } =>
				candidate.score !== null,
		)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((candidate) => candidate.entry);
}

/** Why a blob is listed: it matched the query, or the query is about extending. */
export interface BlobMatch {
	row: BlobRow;
	reason: "match" | "expiring";
}

/** An object id or blob id fragment, lower-cased, without a leading 0x. */
const idFragment = (value: string) =>
	value.trim().toLowerCase().replace(/^0x/, "");

/**
 * The blobs a query names, best first: by name like a command, or by a
 * fragment of the blob id or object id (a prefix ranks above a fragment
 * found inside). A query about extending or expiry that names no blob
 * lists the live blobs expiring soonest instead, to extend from the list.
 */
export function matchBlobs(
	query: string,
	rows: readonly BlobRow[],
	limit = MAX_BLOB_RESULTS,
): BlobMatch[] {
	const needle = query.trim();
	if (needle === "") return [];
	const fragment = idFragment(needle);
	const scored = rows
		.map((row) => {
			const name = row.blob.name ? matchScore(needle, row.blob.name) : null;
			const blobId = row.blob.blobId.toLowerCase();
			const objectId = idFragment(row.blob.objectId);
			const id =
				fragment.length < 4
					? null
					: blobId.startsWith(fragment) || objectId.startsWith(fragment)
						? 90
						: blobId.includes(fragment) || objectId.includes(fragment)
							? 50
							: null;
			const score = Math.max(name ?? -1, id ?? -1);
			return { row, score };
		})
		.filter((candidate) => candidate.score >= 0)
		.sort(
			(a, b) => b.score - a.score || a.row.blob.endEpoch - b.row.blob.endEpoch,
		);
	if (scored.length > 0)
		return scored
			.slice(0, limit)
			.map((candidate) => ({ row: candidate.row, reason: "match" }));
	if (!EXTEND_INTENT.test(needle.toLowerCase())) return [];
	return rows
		.filter((row) => row.status.kind === "expiring")
		.sort((a, b) => a.blob.endEpoch - b.blob.endEpoch)
		.slice(0, limit)
		.map((row) => ({ row, reason: "expiring" }));
}
