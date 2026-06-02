import type { PublicationReader, SuiAddress } from "@arcadiasystems/morse-sdk";
import type { MorseFile } from "../types.js";
import { listCollectionFiles } from "./list-collection-files.js";

/**
 * List every file across all publications owned by an address: page through
 * owned publications, read each publication's collections, and scan each
 * collection's entries.
 */
export async function listOwnedFiles(
	reader: PublicationReader,
	address: SuiAddress,
	signal?: AbortSignal,
): Promise<MorseFile[]> {
	const files: MorseFile[] = [];
	let cursor: string | undefined;
	do {
		const page = await reader.listPublicationsOwnedBy(address, {
			...(cursor === undefined ? {} : { cursor }),
			...(signal === undefined ? {} : { signal }),
		});
		for (const owned of page.results) {
			const publication = await reader.getPublication(
				owned.publicationId,
				signal,
			);
			for (const collection of publication.collections) {
				const collectionFiles = await listCollectionFiles(
					reader,
					owned.publicationId,
					collection.name,
					signal,
				);
				files.push(...collectionFiles);
			}
		}
		cursor = page.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return files;
}
