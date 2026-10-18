import type { Entry, PublicationId } from "@arcadiasystems/morse-sdk";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import { loadMorseSdk, type MorseSdk } from "./load-morse-sdk";

/**
 * The Morse publications the wallet owns (through an OwnerCap) or writes to
 * (through a PublisherCap), with their entries, read through morse-sdk
 * 0.9.0 (PROTOCOL-NOTES section 12). Morse has no index from a blob to the
 * entries that use it, so every entry of every collection is read; the
 * blobs the entries' public revisions point at are what "Published" counts.
 */

/** What a published revision points at: a Blob object, or a file in a quilt. */
export type PublishedRef =
	| { kind: "blob"; objectId: string }
	| { kind: "quilt"; quiltBlobId: string };

export interface PublicationSummary {
	id: string;
	name: string;
	slug: string;
	/** `owner` when the wallet holds its OwnerCap, else `publisher`. */
	role: "owner" | "publisher";
	entries: number;
	/** Entries with a public revision; drafts are not published yet. */
	publicEntries: number;
	/** What each entry's public revision points at. */
	refs: readonly PublishedRef[];
}

export type Publications =
	| { kind: "complete"; publications: readonly PublicationSummary[] }
	/** The count cannot be real; the reason says why. */
	| { kind: "unavailable"; reason: string };

/** Entries read across all publications before the count gives up. */
const MAX_ENTRIES = 2_000;
const PAGE_SIZE = 50;

export async function readPublications(
	client: NetworkClient,
	network: NetworkId,
	owner: string,
	signal: AbortSignal,
): Promise<Publications> {
	const sdk = await loadMorseSdk();
	// Always fromMorseConfig: the raw constructor with the wrong package id
	// silently empties type-filtered lists (morse-sdk README).
	const reader = sdk.RpcPublicationReader.fromMorseConfig(
		sdk.morseConfig({ network }),
		client,
	);
	const address = sdk.toSuiAddress(owner);
	const [owned, caps] = await Promise.all([
		readAll((cursor) =>
			reader.listPublicationsOwnedBy(address, pageOptions(cursor, signal)),
		),
		readAll((cursor) =>
			reader.listPublisherCapsOwnedBy(address, pageOptions(cursor, signal)),
		),
	]);
	const ownedIds = new Set(owned.map((handle) => handle.publicationId));
	const ids = [
		...new Set([...ownedIds, ...caps.map((cap) => cap.publicationId)]),
	];

	const budget = { left: MAX_ENTRIES };
	const read = await Promise.all(
		ids.map((id) =>
			readPublication(sdk, reader, id, ownedIds.has(id), budget, signal),
		),
	);
	if (budget.left < 0)
		return {
			kind: "unavailable",
			reason: `These publications hold more than ${MAX_ENTRIES.toLocaleString("en-US")} entries, more than the app reads to count published files.`,
		};
	const publications = read
		.filter((entry): entry is PublicationSummary => entry !== null)
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
	return { kind: "complete", publications };
}

type Reader = InstanceType<MorseSdk["RpcPublicationReader"]>;

async function readPublication(
	sdk: MorseSdk,
	reader: Reader,
	id: PublicationId,
	owned: boolean,
	budget: { left: number },
	signal: AbortSignal,
): Promise<PublicationSummary | null> {
	let publication: Awaited<ReturnType<Reader["getPublication"]>>;
	try {
		publication = await reader.getPublication(id, signal);
	} catch (error) {
		// A cap outlives a deleted publication; it publishes nothing.
		if (error instanceof sdk.NotFoundError && error.resource === "publication")
			return null;
		throw error;
	}
	const collections = await Promise.all(
		publication.collections.map(async (collection) => {
			const entries: Entry[] = [];
			for await (const entry of reader.scanEntries(id, collection.name, {
				pageSize: PAGE_SIZE,
				signal,
			})) {
				budget.left -= 1;
				if (budget.left < 0) break;
				entries.push(entry);
			}
			return entries;
		}),
	);
	const entries = collections.flat();
	const refs = entries.flatMap((entry): PublishedRef[] => {
		const revision =
			entry.publicHead === null ? undefined : entry.revisions[entry.publicHead];
		if (!revision) return [];
		const { blobRef } = revision;
		return blobRef.kind === "blob"
			? [{ kind: "blob", objectId: blobRef.blobObjectId }]
			: [
					{
						kind: "quilt",
						quiltBlobId: sdk.decodeQuiltPatchId(blobRef.patchId).quiltBlobId,
					},
				];
	});
	return {
		id,
		name: publication.name,
		slug: publication.slug,
		role: owned ? "owner" : "publisher",
		entries: entries.length,
		publicEntries: refs.length,
		refs,
	};
}

function pageOptions(cursor: string | null, signal: AbortSignal) {
	return { limit: PAGE_SIZE, signal, ...(cursor ? { cursor } : {}) };
}

/** Every page of a cursor-paged list. */
async function readAll<T>(
	page: (
		cursor: string | null,
	) => Promise<{ results: readonly T[]; nextCursor: string | null }>,
): Promise<T[]> {
	const results: T[] = [];
	let cursor: string | null = null;
	do {
		const next = await page(cursor);
		results.push(...next.results);
		cursor = next.nextCursor;
	} while (cursor !== null);
	return results;
}
