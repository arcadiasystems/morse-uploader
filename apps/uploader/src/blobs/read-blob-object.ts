import { ObjectError } from "@mysten/sui/client";
import type { NetworkClient } from "@/network/create-network-client";
import type { BlobRecord } from "./blob-record";
import { parseBlob } from "./parse-blob";
import { readAttributes } from "./read-owned-blobs";

/** One Blob object as chain holds it now, with what the drawer's record shows. */
export interface LiveBlob {
	record: BlobRecord;
	/** The transaction that last changed the object: its register, certify or latest extend. */
	previousTransaction: string | null;
	/** The owning address; `null` when the object is not address-owned. */
	owner: string | null;
}

/**
 * Reads one Blob object and its attributes over gRPC, for the drawer: the
 * list is a snapshot, while extend and certify change the object.
 * @returns `null` when the object no longer exists (it was deleted or burned).
 */
export async function readLiveBlob(
	client: NetworkClient,
	objectId: string,
	signal: AbortSignal,
): Promise<LiveBlob | null> {
	const [{ objects }, [attributes]] = await Promise.all([
		client.core.getObjects({
			objectIds: [objectId],
			include: { content: true, previousTransaction: true },
			signal,
		}),
		readAttributes(client, [objectId], signal),
	]);
	const [object] = objects;
	if (object instanceof ObjectError && object.reason === "notFound")
		return null;
	if (object instanceof Error) throw object;
	if (!object) throw new Error(`Sui returned nothing for ${objectId}.`);
	return {
		record: parseBlob(object.content, attributes ?? {}),
		previousTransaction: object.previousTransaction,
		owner:
			object.owner.$kind === "AddressOwner" ? object.owner.AddressOwner : null,
	};
}

/** Objects per batched read, as the owned-blob listing pages them. */
const BATCH_SIZE = 50;

/**
 * The current records of several Blob objects, in batched reads, without
 * attributes. Objects that no longer exist are left out.
 */
export async function readCurrentRecords(
	client: NetworkClient,
	objectIds: readonly string[],
): Promise<BlobRecord[]> {
	const records: BlobRecord[] = [];
	for (let start = 0; start < objectIds.length; start += BATCH_SIZE) {
		const { objects } = await client.core.getObjects({
			objectIds: objectIds.slice(start, start + BATCH_SIZE),
			include: { content: true },
		});
		for (const object of objects) {
			if (object instanceof ObjectError && object.reason === "notFound")
				continue;
			if (object instanceof Error) throw object;
			records.push(parseBlob(object.content, {}));
		}
	}
	return records;
}
