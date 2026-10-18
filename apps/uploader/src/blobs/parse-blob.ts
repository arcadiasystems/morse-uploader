import { blobIdFromInt } from "@mysten/walrus";
import {
	type BlobAttributes,
	contentTypeFromAttributes,
	isQuilt,
	isSealEncrypted,
	nameFromAttributes,
} from "./blob-attributes";
import { BlobBcs, MetadataFieldBcs } from "./blob-bcs";
import type { BlobRecord } from "./blob-record";

/**
 * Decodes a `Blob` object's BCS contents. The on-chain `blob_id` is a u256;
 * `blobIdFromInt` turns it into the URL-safe base64 id that aggregators and
 * `readBlob` take (PROTOCOL-NOTES sections 7 and 8).
 */
export function parseBlob(
	contents: Uint8Array,
	attributes: BlobAttributes,
): BlobRecord {
	const blob = BlobBcs.parse(contents);
	return {
		objectId: blob.id,
		blobId: blobIdFromInt(BigInt(blob.blob_id)),
		name: nameFromAttributes(attributes),
		size: BigInt(blob.size),
		encodedSize: BigInt(blob.storage.storage_size),
		deletable: blob.deletable,
		registeredEpoch: blob.registered_epoch,
		certifiedEpoch: blob.certified_epoch,
		startEpoch: blob.storage.start_epoch,
		endEpoch: blob.storage.end_epoch,
		isQuilt: isQuilt(attributes),
		isEncrypted: isSealEncrypted(attributes),
		contentType: contentTypeFromAttributes(attributes),
		encodingType: blob.encoding_type,
	};
}

/** Decodes the BCS contents of a blob's `metadata` dynamic field into its attributes. */
export function parseMetadataField(contents: Uint8Array): BlobAttributes {
	const field = MetadataFieldBcs.parse(contents);
	return Object.fromEntries(
		field.value.metadata.contents.map(({ key, value }) => [key, value]),
	);
}
