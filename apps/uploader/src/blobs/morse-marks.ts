import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { PublishedRef } from "@/morse/read-publications";
import type { RecipientFileRecord } from "@/morse/read-shared-files";
import type { BlobRow } from "./blob-row";

/**
 * Which of the wallet's blobs Morse records point at. Morse has no index
 * from a blob to its records, so these match the other way round.
 */

/**
 * The object ids of the rows that a published revision points at: a Blob
 * object by its id, or a quilt by the quilt blob id inside a patch id.
 */
export function publishedObjectIds(
	rows: readonly BlobRow[],
	refs: readonly PublishedRef[],
): Set<string> {
	const objects = new Set<string>();
	const quilts = new Set<string>();
	for (const ref of refs) {
		if (ref.kind === "blob") objects.add(normalizeSuiAddress(ref.objectId));
		else quilts.add(ref.quiltBlobId);
	}
	const published = new Set<string>();
	for (const { blob } of rows) {
		if (
			objects.has(normalizeSuiAddress(blob.objectId)) ||
			(blob.isQuilt && quilts.has(blob.blobId))
		)
			published.add(blob.objectId);
	}
	return published;
}

/** A RecipientFile is shared when someone besides its owner is a member. */
export function isShared(file: RecipientFileRecord): boolean {
	const owner = normalizeSuiAddress(file.owner);
	return file.members.some((member) => normalizeSuiAddress(member) !== owner);
}

/**
 * The object ids of the rows a shared RecipientFile is the access policy
 * of: by its blob object, or by blob id when the file names no object.
 */
export function sharedObjectIds(
	rows: readonly BlobRow[],
	files: readonly RecipientFileRecord[],
): Set<string> {
	const objects = new Set<string>();
	const blobIds = new Set<string>();
	for (const file of files) {
		if (!isShared(file)) continue;
		if (file.blobObjectId === null) blobIds.add(file.blobId);
		else objects.add(normalizeSuiAddress(file.blobObjectId));
	}
	const shared = new Set<string>();
	for (const { blob } of rows) {
		if (
			objects.has(normalizeSuiAddress(blob.objectId)) ||
			blobIds.has(blob.blobId)
		)
			shared.add(blob.objectId);
	}
	return shared;
}
