import type { WalrusBlobObjectSource } from "../types.js";

/** Read a blob's Walrus storage end-epoch from its on-chain Blob object. */
export async function fetchBlobEndEpoch(
	source: WalrusBlobObjectSource,
	blobObjectId: string,
): Promise<number> {
	const blob = await source.getBlobObject(blobObjectId);
	return blob.storage.end_epoch;
}
