import type { PublicationReader } from "@arcadiasystems/morse-sdk";
import type { ListUserFilesOptions, MorseFile } from "../types.js";
import { listCollectionFiles } from "./list-collection-files.js";
import { listOwnedFiles } from "./list-owned-files.js";

/**
 * List a user's files. Scope to a single collection with
 * `{ publicationId, collectionName }`, or to everything an address owns with
 * `{ address }`. The collection scope takes precedence when both are given.
 *
 * @throws {Error} when neither a collection scope nor an address is provided.
 */
export function listUserFiles(
	reader: PublicationReader,
	options: ListUserFilesOptions,
): Promise<MorseFile[]> {
	if (
		options.publicationId !== undefined &&
		options.collectionName !== undefined
	) {
		return listCollectionFiles(
			reader,
			options.publicationId,
			options.collectionName,
			options.signal,
		);
	}
	if (options.address !== undefined) {
		return listOwnedFiles(reader, options.address, options.signal);
	}
	throw new Error(
		"listUserFiles: provide either { publicationId, collectionName } or { address }.",
	);
}
