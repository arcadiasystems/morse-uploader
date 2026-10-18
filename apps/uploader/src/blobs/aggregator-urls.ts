/**
 * Aggregator routes (PROTOCOL-NOTES section 10, docs http-api/reading-blobs
 * and http-api/quilt-http-apis). Every id is URL-safe base64 or a 0x object
 * id, so none needs escaping.
 */

/**
 * A blob by its blob id. The id names the bytes, so the link keeps working
 * for anyone, whoever stores a copy.
 */
export function blobUrl(aggregatorUrl: string, blobId: string): string {
	return `${aggregatorUrl}/v1/blobs/${blobId}`;
}

/**
 * A blob by its Sui object id. Unlike `/v1/blobs/{blobId}`, this route
 * serves the blob's `content-type` and `content-disposition` attributes as
 * headers, so a download keeps its type and file name.
 */
export function blobByObjectIdUrl(
	aggregatorUrl: string,
	objectId: string,
): string {
	return `${aggregatorUrl}/v1/blobs/by-object-id/${objectId}`;
}

/**
 * One file in a quilt, by its 37-byte patch id. The patch id route serves
 * the file whatever characters its identifier holds; the by-quilt-id route
 * with an identifier is unconfirmed for identifiers with `/` (notes
 * UNCONFIRMED item 7).
 */
export function quiltPatchUrl(aggregatorUrl: string, patchId: string): string {
	return `${aggregatorUrl}/v1/blobs/by-quilt-patch-id/${patchId}`;
}

/** A quilt's files: `[{ identifier, patch_id, tags }]`. */
export function quiltPatchesUrl(
	aggregatorUrl: string,
	quiltBlobId: string,
): string {
	return `${aggregatorUrl}/v1/quilts/${quiltBlobId}/patches`;
}
