import type { ChainBlob, Network } from "./chain";

/**
 * Morse and transaction state for assertions, read over Sui GraphQL: a
 * different transport from the app's gRPC client and morse-sdk, and no
 * Morse code of its own. Package ids are Testnet's, from morse-sdk 0.9.0's
 * config and design/PROTOCOL-NOTES.md section 12.
 */

/** The original Morse package: type origin of Publication, OwnerCap, PublisherCap and Entry. */
const MORSE_TYPES =
	"0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0";
/** Where the recipient_file module was first published: the type origin of its events. */
const RECIPIENT_FILE_ORIGIN =
	"0x3bb8773c55b5bfde6c3821da52afd038a52e6a6ac586d5106013144f3aa7747f";

const PAGE_SIZE = 50;

async function graphql<T>(
	network: Network,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const response = await fetch(`https://graphql.${network}.sui.io/graphql`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ query, variables }),
	});
	if (!response.ok)
		throw new Error(`Sui GraphQL ${network} answered ${response.status}.`);
	const body = (await response.json()) as {
		data?: T;
		errors?: { message: string }[];
	};
	if (body.errors?.length || !body.data)
		throw new Error(
			`Sui GraphQL ${network}: ${body.errors?.map((error) => error.message).join("; ")}`,
		);
	return body.data;
}

/** The JSON of every object of `type` the owner holds, paged 50 at a time. */
async function ownedJson<T>(
	network: Network,
	owner: string,
	type: string,
): Promise<T[]> {
	const results: T[] = [];
	let after: string | null = null;
	do {
		const data: {
			address: {
				objects: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: { contents: { json: T } }[];
				};
			} | null;
		} = await graphql(
			network,
			`query($owner: SuiAddress!, $type: String!, $after: String) {
				address(address: $owner) {
					objects(filter: { type: $type }, first: ${PAGE_SIZE}, after: $after) {
						pageInfo { hasNextPage endCursor }
						nodes { contents { json } }
					}
				}
			}`,
			{ owner, type, after },
		);
		const page = data.address?.objects;
		if (!page) break;
		results.push(...page.nodes.map((node) => node.contents.json));
		after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
	} while (after !== null);
	return results;
}

/** An object's Move JSON, or `null` when it no longer exists. */
async function objectJson<T>(network: Network, id: string): Promise<T | null> {
	const data = await graphql<{
		object: { asMoveObject: { contents: { json: T } } | null } | null;
	}>(
		network,
		"query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { json } } } }",
		{ id },
	);
	return data.object?.asMoveObject?.contents.json ?? null;
}

/** What a public revision points at: a Blob object, or a quilt by its blob id. */
export type ChainPublishedRef =
	| { kind: "blob"; objectId: string }
	| { kind: "quilt"; quiltBlobId: string };

export interface ChainPublication {
	id: string;
	name: string;
	/** Whether the wallet holds its OwnerCap (else only a PublisherCap). */
	owned: boolean;
	entries: number;
	/** What each entry's public-head revision points at. */
	publicRefs: ChainPublishedRef[];
}

interface PublicationJson {
	name: string;
	collections: {
		contents: { value: { entries: { id: string } } }[];
	};
}

interface EntryJson {
	revisions: {
		blob_ref: { "@variant": string; pos0: string };
	}[];
	public_head: string | null;
}

/** Every Entry in a publication collection's entries table, paged 50 at a time. */
async function tableEntries(
	network: Network,
	tableId: string,
): Promise<EntryJson[]> {
	const entries: EntryJson[] = [];
	let after: string | null = null;
	do {
		const data: {
			address: {
				dynamicFields: {
					pageInfo: { hasNextPage: boolean; endCursor: string | null };
					nodes: { value: { json: EntryJson } | null }[];
				};
			} | null;
		} = await graphql(
			network,
			`query($id: SuiAddress!, $after: String) {
				address(address: $id) {
					dynamicFields(first: ${PAGE_SIZE}, after: $after) {
						pageInfo { hasNextPage endCursor }
						nodes { value { ... on MoveValue { json } } }
					}
				}
			}`,
			{ id: tableId, after },
		);
		const page = data.address?.dynamicFields;
		if (!page) break;
		for (const node of page.nodes)
			if (node.value) entries.push(node.value.json);
		after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
	} while (after !== null);
	return entries;
}

/** A public revision's target: the Blob object id, or the quilt blob id in a patch id's first 32 bytes. */
function publicRef(entry: EntryJson): ChainPublishedRef | null {
	if (entry.public_head === null) return null;
	const revision = entry.revisions[Number(entry.public_head)];
	if (!revision) return null;
	const { "@variant": variant, pos0 } = revision.blob_ref;
	if (variant === "Blob") return { kind: "blob", objectId: pos0 };
	return {
		kind: "quilt",
		quiltBlobId: Buffer.from(pos0, "base64")
			.subarray(0, 32)
			.toString("base64url"),
	};
}

/**
 * The publications the wallet owns (OwnerCap) or writes to (PublisherCap),
 * skipping deleted ones, with every entry read from their tables.
 */
export async function walletPublications(
	network: Network,
	owner: string,
): Promise<ChainPublication[]> {
	const [ownerCaps, publisherCaps] = await Promise.all([
		ownedJson<{ publication_id: string }>(
			network,
			owner,
			`${MORSE_TYPES}::publication::OwnerCap`,
		),
		ownedJson<{ publication_id: string }>(
			network,
			owner,
			`${MORSE_TYPES}::publication::PublisherCap`,
		),
	]);
	const owned = new Set(ownerCaps.map((cap) => cap.publication_id));
	const ids = [
		...new Set([...owned, ...publisherCaps.map((cap) => cap.publication_id)]),
	];
	const publications = await Promise.all(
		ids.map(async (id): Promise<ChainPublication | null> => {
			const json = await objectJson<PublicationJson>(network, id);
			if (json === null) return null;
			const entries = (
				await Promise.all(
					json.collections.contents.map((collection) =>
						tableEntries(network, collection.value.entries.id),
					),
				)
			).flat();
			return {
				id,
				name: json.name,
				owned: owned.has(id),
				entries: entries.length,
				publicRefs: entries.flatMap((entry) => publicRef(entry) ?? []),
			};
		}),
	);
	return publications
		.filter(
			(publication): publication is ChainPublication => publication !== null,
		)
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The wallet's blob objects a public revision points at, by Blob object id or quilt blob id. */
export function publishedObjectIds(
	blobs: readonly ChainBlob[],
	refs: readonly ChainPublishedRef[],
): Set<string> {
	const objects = new Set(
		refs.flatMap((ref) => (ref.kind === "blob" ? [ref.objectId] : [])),
	);
	const quilts = new Set(
		refs.flatMap((ref) => (ref.kind === "quilt" ? [ref.quiltBlobId] : [])),
	);
	return new Set(
		blobs
			.filter(
				(blob) =>
					objects.has(blob.objectId) ||
					(blob.attributes._walrusBlobType === "quilt" &&
						quilts.has(blob.blobId)),
			)
			.map((blob) => blob.objectId),
	);
}

interface RecipientFileEvent {
	type: string;
	json: { file: string; members?: string[]; recipient?: string };
}

interface RecipientFileJson {
	owner: string;
	blob_object_id: string | null;
	blob_id: string;
	members: { contents: string[] };
}

/** The owner's recipient_file events, oldest first, paged 50 at a time from the newest. */
async function recipientFileEvents(
	network: Network,
	owner: string,
): Promise<RecipientFileEvent[]> {
	const pages: RecipientFileEvent[][] = [];
	let before: string | null = null;
	do {
		const data: {
			events: {
				pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
				nodes: {
					contents: {
						type: { repr: string };
						json: RecipientFileEvent["json"];
					};
				}[];
			};
		} = await graphql(
			network,
			`query($sender: SuiAddress!, $type: String!, $before: String) {
				events(filter: { sender: $sender, type: $type }, last: ${PAGE_SIZE}, before: $before) {
					pageInfo { hasPreviousPage startCursor }
					nodes { contents { type { repr } json } }
				}
			}`,
			{
				sender: owner,
				type: `${RECIPIENT_FILE_ORIGIN}::recipient_file`,
				before,
			},
		);
		pages.unshift(
			data.events.nodes.map((node) => ({
				type: node.contents.type.repr.split("::").at(-1) ?? "",
				json: node.contents.json,
			})),
		);
		before = data.events.pageInfo.hasPreviousPage
			? data.events.pageInfo.startCursor
			: null;
	} while (before !== null);
	return pages.flat();
}

/**
 * The wallet's blob objects whose RecipientFile someone besides the owner
 * can decrypt. The owner's events are replayed into member sets; the files
 * left with another member are read live, and their blob object ids (or
 * blob ids when they name no object) are matched to the wallet's blobs.
 */
export async function sharedObjectIds(
	network: Network,
	owner: string,
	blobs: readonly ChainBlob[],
): Promise<Set<string>> {
	const members = new Map<string, Set<string>>();
	for (const { type, json } of await recipientFileEvents(network, owner)) {
		switch (type) {
			case "RecipientFileCreated":
				members.set(json.file, new Set(json.members ?? []));
				break;
			case "RecipientAdded":
				if (json.recipient) members.get(json.file)?.add(json.recipient);
				break;
			case "RecipientRemoved":
				if (json.recipient) members.get(json.file)?.delete(json.recipient);
				break;
			case "RecipientFileDeleted":
			case "RecipientFileOwnershipTransferred":
				members.delete(json.file);
				break;
		}
	}
	const candidates = [...members]
		.filter(([, set]) => [...set].some((member) => member !== owner))
		.map(([file]) => file);
	const files = await Promise.all(
		candidates.map((file) => objectJson<RecipientFileJson>(network, file)),
	);
	const objects = new Set<string>();
	const blobIds = new Set<string>();
	for (const file of files) {
		if (
			file === null ||
			file.owner !== owner ||
			!file.members.contents.some((member) => member !== owner)
		)
			continue;
		if (file.blob_object_id === null)
			blobIds.add(Buffer.from(file.blob_id, "base64").toString("base64url"));
		else objects.add(file.blob_object_id);
	}
	return new Set(
		blobs
			.filter((blob) => objects.has(blob.objectId) || blobIds.has(blob.blobId))
			.map((blob) => blob.objectId),
	);
}

/** The digests of the last `count` transactions the address sent, newest first. */
export async function sentDigests(
	network: Network,
	sender: string,
	count = 25,
): Promise<string[]> {
	const data = await graphql<{
		transactions: { nodes: { digest: string }[] };
	}>(
		network,
		`query($sender: SuiAddress!) {
			transactions(filter: { sentAddress: $sender }, last: ${count}) { nodes { digest } }
		}`,
		{ sender },
	);
	return data.transactions.nodes.map((node) => node.digest).reverse();
}
