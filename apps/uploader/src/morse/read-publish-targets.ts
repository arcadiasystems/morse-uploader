import type { PublisherCap } from "@arcadiasystems/morse-sdk";
import { bcs } from "@mysten/sui/bcs";
import { ObjectError } from "@mysten/sui/client";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import { loadMorseSdk } from "./load-morse-sdk";

/**
 * Where "Also publish to Morse" can add entries: every publication the
 * wallet holds a usable PublisherCap for, with its collections
 * (PROTOCOL-NOTES section 12). Owning a publication is not enough; adding
 * an entry needs a PublisherCap.
 */
export interface PublishTarget {
	publicationId: string;
	publicationName: string;
	publicationSlug: string;
	publisherCapId: string;
	collections: readonly PublishCollection[];
}

export interface PublishCollection {
	name: string;
	/** A blob collection takes standalone blobs; a quilt collection takes quilt files. */
	storageMode: "blob" | "quilt";
}

/** A revoked cap's id is a key of the publication's `Table<ID, bool>` denylist. */
const DENYLIST_KEY_TYPE = "0x2::object::ID";
const PAGE_SIZE = 50;

export async function readPublishTargets(
	client: NetworkClient,
	network: NetworkId,
	owner: string,
	signal: AbortSignal,
): Promise<PublishTarget[]> {
	const { morseConfig, NotFoundError, RpcPublicationReader, toSuiAddress } =
		await loadMorseSdk();
	// Always fromMorseConfig: the raw constructor with the wrong package id
	// silently empties type-filtered lists (morse-sdk README).
	const reader = RpcPublicationReader.fromMorseConfig(
		morseConfig({ network }),
		client,
	);

	const caps: PublisherCap[] = [];
	let cursor: string | null = null;
	do {
		const page = await reader.listPublisherCapsOwnedBy(toSuiAddress(owner), {
			limit: PAGE_SIZE,
			signal,
			...(cursor ? { cursor } : {}),
		});
		caps.push(...page.results);
		cursor = page.nextCursor;
	} while (cursor !== null);

	const capsByPublication = new Map<
		PublisherCap["publicationId"],
		PublisherCap[]
	>();
	for (const cap of caps) {
		const group = capsByPublication.get(cap.publicationId);
		if (group) group.push(cap);
		else capsByPublication.set(cap.publicationId, [cap]);
	}
	const targets = await Promise.all(
		[...capsByPublication].map(
			async ([
				publicationId,
				publicationCaps,
			]): Promise<PublishTarget | null> => {
				try {
					const publication = await reader.getPublication(
						publicationId,
						signal,
					);
					const usable = await firstUnrevoked(
						client,
						publication.revokedPublisherCapsTableId,
						publicationCaps,
						signal,
					);
					if (!usable) return null;
					return {
						publicationId,
						publicationName: publication.name,
						publicationSlug: publication.slug,
						publisherCapId: usable.id,
						collections: publication.collections.map((collection) => ({
							name: collection.name,
							storageMode: collection.storageMode,
						})),
					};
				} catch (error) {
					// A cap outlives a deleted publication; such a cap writes nowhere.
					if (
						error instanceof NotFoundError &&
						error.resource === "publication"
					)
						return null;
					throw error;
				}
			},
		),
	);
	return targets
		.filter((target): target is PublishTarget => target !== null)
		.sort((a, b) => a.publicationName.localeCompare(b.publicationName));
}

/**
 * The first cap that is not on the publication's denylist. A revoked cap
 * would make `addEntry` abort with `EPublisherCapRevoked`.
 */
async function firstUnrevoked(
	client: NetworkClient,
	denylistTableId: string,
	caps: readonly PublisherCap[],
	signal: AbortSignal,
): Promise<PublisherCap | null> {
	const { objects } = await client.core.getObjects({
		objectIds: caps.map((cap) =>
			deriveDynamicFieldID(
				denylistTableId,
				DENYLIST_KEY_TYPE,
				bcs.Address.serialize(cap.id).toBytes(),
			),
		),
		signal,
	});
	const index = objects.findIndex((entry) => {
		if (!(entry instanceof Error)) return false;
		if (entry instanceof ObjectError && entry.reason === "notFound")
			return true;
		throw entry;
	});
	return caps[index] ?? null;
}
