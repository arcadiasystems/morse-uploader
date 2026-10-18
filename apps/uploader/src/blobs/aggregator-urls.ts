/**
 * A blob by its Sui object id on an aggregator. Unlike `/v1/blobs/{blobId}`,
 * this route serves the blob's `content-type` and `content-disposition`
 * attributes as headers, so a download keeps its type and file name
 * (PROTOCOL-NOTES section 10).
 */
export function blobByObjectIdUrl(
	aggregatorUrl: string,
	objectId: string,
): string {
	return `${aggregatorUrl}/v1/blobs/by-object-id/${objectId}`;
}
