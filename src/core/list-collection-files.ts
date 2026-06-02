import type {
	PublicationId,
	PublicationReader,
} from "@arcadiasystems/morse-sdk";
import type { MorseFile } from "../types.js";
import { entryToFile } from "../utils/entry-to-file.js";

/** List all files in one collection by scanning its entries (auto-paginated). */
export async function listCollectionFiles(
	reader: PublicationReader,
	publicationId: PublicationId,
	collectionName: string,
	signal?: AbortSignal,
): Promise<MorseFile[]> {
	const files: MorseFile[] = [];
	const options = signal === undefined ? {} : { signal };
	for await (const entry of reader.scanEntries(
		publicationId,
		collectionName,
		options,
	)) {
		const file = entryToFile(publicationId, collectionName, entry);
		if (file !== null) {
			files.push(file);
		}
	}
	return files;
}
