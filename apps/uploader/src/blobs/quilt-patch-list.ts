import { quiltPatchesUrl } from "./aggregator-urls";

/** One file of a quilt as the aggregator lists it. */
export interface QuiltPatchEntry {
	identifier: string;
	/** URL-safe base64 of the 37-byte quilt patch id. */
	patchId: string;
	tags: Readonly<Record<string, string>>;
}

/**
 * Parses `GET /v1/quilts/{id}/patches` (aggregator OpenAPI
 * `list_patches_in_quilt`): `[{ identifier, patch_id, tags }]`.
 * @throws {Error} When the body is not that shape.
 */
export function parseQuiltPatchList(body: unknown): QuiltPatchEntry[] {
	if (!Array.isArray(body))
		throw new Error("The aggregator's patch list is not a list.");
	return body.map((entry: unknown, index) => {
		if (typeof entry !== "object" || entry === null)
			throw new Error(`Patch ${index + 1} in the aggregator's list is empty.`);
		const {
			identifier,
			patch_id: patchId,
			tags,
		} = entry as Record<string, unknown>;
		if (typeof identifier !== "string" || typeof patchId !== "string")
			throw new Error(
				`Patch ${index + 1} in the aggregator's list has no identifier or patch id.`,
			);
		return { identifier, patchId, tags: stringRecord(tags) };
	});
}

function stringRecord(value: unknown): Record<string, string> {
	if (typeof value !== "object" || value === null) return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			(pair): pair is [string, string] => typeof pair[1] === "string",
		),
	);
}

/** Lists by quilt, kept for the session: a blob id names immutable bytes. */
const lists = new Map<string, Promise<QuiltPatchEntry[]>>();

/**
 * A quilt's files with their patch ids and tags, from the aggregator. The
 * SDK reads identifiers from storage nodes but does not expose patch ids,
 * which share links and Morse entries need.
 */
export function readQuiltPatchList(
	aggregatorUrl: string,
	quiltBlobId: string,
): Promise<QuiltPatchEntry[]> {
	const url = quiltPatchesUrl(aggregatorUrl, quiltBlobId);
	const known = lists.get(url);
	if (known) return known;
	const pending = fetch(url).then(async (response) => {
		if (!response.ok)
			throw new Error(
				`The aggregator answered ${response.status} for this quilt's file list.`,
			);
		return parseQuiltPatchList(await response.json());
	});
	lists.set(url, pending);
	// Forget a failed read so the next attempt asks again; callers report it.
	pending.then(undefined, () => lists.delete(url));
	return pending;
}
