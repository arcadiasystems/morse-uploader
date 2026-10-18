import { ObjectError, type SuiClientTypes } from "@mysten/sui/client";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import type { NetworkClient } from "@/network/create-network-client";
import type { BlobAttributes } from "./blob-attributes";
import { METADATA_FIELD_NAME } from "./blob-bcs";
import type { BlobRecord } from "./blob-record";
import { parseBlob, parseMetadataField } from "./parse-blob";

/** Objects per page. Sui full nodes page owned objects; 50 is also GraphQL's maximum. */
const PAGE_SIZE = 50;

/**
 * Reads every Walrus `Blob` object the owner holds on the client's network,
 * with its attributes, over gRPC. Each page is one `ListOwnedObjects` call
 * filtered to the current Blob type, plus one batched `BatchGetObjects` for
 * the pages' `metadata` dynamic fields, whose ids are derived locally.
 * Expired and never-certified blobs are still owned objects, so they are
 * listed too.
 */
export async function readOwnedBlobs(
	client: NetworkClient,
	owner: string,
	signal: AbortSignal,
): Promise<BlobRecord[]> {
	// Testnet package ids change on redeploy, so the type is read from chain.
	const type = await client.walrus.getBlobType();
	const blobs: BlobRecord[] = [];
	let cursor: string | null = null;
	do {
		// Annotated: the loop feeds `page.cursor` back in, which defeats inference.
		const page: SuiClientTypes.ListOwnedObjectsResponse<{ content: true }> =
			await client.core.listOwnedObjects({
				owner,
				type,
				limit: PAGE_SIZE,
				cursor,
				include: { content: true },
				signal,
			});
		const attributes = await readAttributes(
			client,
			page.objects.map((object) => object.objectId),
			signal,
		);
		page.objects.forEach((object, index) => {
			blobs.push(parseBlob(object.content, attributes[index] ?? {}));
		});
		cursor = page.hasNextPage ? page.cursor : null;
	} while (cursor !== null);
	return blobs;
}

/**
 * The attributes of each blob, in order. A blob without a `metadata` field
 * has no attributes; any other failed lookup fails the read.
 */
export async function readAttributes(
	client: NetworkClient,
	blobObjectIds: readonly string[],
	signal: AbortSignal,
): Promise<BlobAttributes[]> {
	if (blobObjectIds.length === 0) return [];
	const { objects } = await client.core.getObjects({
		objectIds: blobObjectIds.map((id) =>
			deriveDynamicFieldID(
				id,
				METADATA_FIELD_NAME.type,
				METADATA_FIELD_NAME.bcs,
			),
		),
		include: { content: true },
		signal,
	});
	return objects.map((field) => {
		if (!(field instanceof Error)) return parseMetadataField(field.content);
		if (field instanceof ObjectError && field.reason === "notFound") return {};
		throw field;
	});
}
