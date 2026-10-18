import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { PublishedRef } from "@/morse/read-publications";
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
