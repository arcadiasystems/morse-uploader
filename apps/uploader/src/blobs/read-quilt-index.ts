import { createLimiter } from "@/lib/create-limiter";
import type { NetworkClient } from "@/network/create-network-client";
import type { ReadQuiltIndex } from "./quilt-patch-store";

/** Identifier reads in flight at once for one quilt; each is one sliver from one node. */
const IDENTIFIER_READS_AT_ONCE = 6;

/**
 * Reads quilt indexes from storage nodes with `@mysten/walrus` 1.2.35. Its
 * quilt reader fixed the 1.1.x bug that read one sliver too few
 * (PROTOCOL-NOTES section 7). The index sits in the quilt's first columns;
 * `WalrusBlob.files()` keeps only patch ids from it, so each identifier is
 * one more sliver read, made only when a quilt is expanded.
 */
export function createSdkQuiltIndexReader(
	client: NetworkClient,
): ReadQuiltIndex {
	return async (blobId) => {
		const files = await (await client.walrus.getBlob({ blobId })).files();
		return {
			patchCount: files.length,
			readIdentifiers: () => {
				const limit = createLimiter(IDENTIFIER_READS_AT_ONCE);
				return Promise.all(
					files.map((file) =>
						limit(async () => {
							const identifier = await file.getIdentifier();
							if (identifier === null) {
								throw new Error(
									`A patch in quilt ${blobId} has no identifier in its header.`,
								);
							}
							return identifier;
						}),
					),
				);
			},
		};
	};
}
