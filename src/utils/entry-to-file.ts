import type { Entry, PublicationId } from "@arcadiasystems/morse-sdk";
import type { MorseFile } from "../types.js";

/**
 * Flatten an entry's current revision into a {@link MorseFile}. Uses the public
 * head when set, else the latest revision. Returns null when the entry has no
 * revision to show.
 */
export function entryToFile(
	publicationId: PublicationId,
	collectionName: string,
	entry: Entry,
): MorseFile | null {
	const index = entry.publicHead ?? entry.revisions.length - 1;
	const revision = entry.revisions[index];
	if (revision === undefined) {
		return null;
	}
	const base = {
		publicationId,
		collectionName,
		entryId: entry.id,
		name: entry.name,
		revisionId: revision.id,
		contentType: revision.contentType,
		encrypted: revision.encrypted,
		sealId: revision.sealId,
		blobRef: revision.blobRef,
	};
	if (revision.blobRef.kind === "blob") {
		return { ...base, blobObjectId: revision.blobRef.blobObjectId };
	}
	return base;
}
