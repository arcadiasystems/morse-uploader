import type { RecipientFile } from "@arcadiasystems/morse-sdk";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import { loadMorseSdk } from "./load-morse-sdk";
import { readRecipientFileEvents } from "./recipient-file-events";

/**
 * Finds the Morse RecipientFile that is an encrypted blob's access policy
 * (PROTOCOL-NOTES section 11, option 1). A RecipientFile points at its blob,
 * not the other way round, and it is a shared object, so it cannot be
 * listed by owner. The wallet's `RecipientFileCreated` events can. The
 * events carry the file's name but not its blob, so files are read,
 * likeliest first, until one points at the blob.
 */

/** RecipientFile reads before giving up, made a few at a time. */
const MAX_FILE_READS = 60;
const READS_AT_ONCE = 6;

export interface FindRecipientFileInput {
	client: NetworkClient;
	network: NetworkConfig;
	owner: string;
	blob: { objectId: string; blobId: string; name: string | null };
	signal: AbortSignal;
}

interface CreatedEvent {
	fileId: string;
	name: string;
}

/**
 * The RecipientFile the owner created for this blob, or `null` when none of
 * the owner's files points at it.
 */
export async function findRecipientFile({
	client,
	network,
	owner,
	blob,
	signal,
}: FindRecipientFileInput): Promise<RecipientFile | null> {
	const sdk = await loadMorseSdk();
	const config = sdk.morseConfig({ network: network.id });
	const origin = config.recipientFileEventOriginPackageId;
	if (!origin) return null;
	const { events: created } = await readRecipientFileEvents({
		graphqlUrl: network.graphqlUrl,
		type: `${origin}::recipient_file::RecipientFileCreated`,
		sender: owner,
		signal,
	});
	// Newest first: the file for a recent upload is likely among the latest.
	const events = created.reverse().flatMap((event): CreatedEvent[] => {
		const { file, name } = event.json;
		return typeof file === "string" && typeof name === "string"
			? [{ fileId: file, name }]
			: [];
	});
	// Morse Uploader names a RecipientFile after the file itself, while the
	// blob's name can hold the folder path.
	const baseName = blob.name?.split("/").at(-1) ?? null;
	const likely = events.filter(
		(event) => event.name === blob.name || event.name === baseName,
	);
	const others = events.filter((event) => !likely.includes(event));
	const candidates = [...likely, ...others].slice(0, MAX_FILE_READS);

	const reader = sdk.RpcRecipientFilesReader.fromConfig(client, {
		packageId: config.packageId,
	});
	const blobObjectId = sdk.toSuiObjectId(blob.objectId);
	async function read(fileId: string): Promise<RecipientFile | null> {
		try {
			return await reader.getRecipientFile(
				sdk.toRecipientFileId(fileId),
				signal,
			);
		} catch (error) {
			// The owner deleted that file since; it points nowhere.
			if (
				error instanceof sdk.NotFoundError &&
				error.resource === "recipient-file"
			)
				return null;
			throw error;
		}
	}
	for (let start = 0; start < candidates.length; start += READS_AT_ONCE) {
		const files = await Promise.all(
			candidates
				.slice(start, start + READS_AT_ONCE)
				.map((candidate) => read(candidate.fileId)),
		);
		const match = files.find(
			(file) =>
				file !== null &&
				(file.blobObjectId === null
					? file.blobId === blob.blobId
					: sdk.toSuiObjectId(file.blobObjectId) === blobObjectId),
		);
		if (match) return match;
	}
	return null;
}
