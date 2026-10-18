import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import { loadMorseSdk } from "./load-morse-sdk";
import { readRecipientFileEvents } from "./recipient-file-events";

/**
 * The wallet's Morse RecipientFiles that someone besides the owner can
 * decrypt: the "Shared" filter. The owner's RecipientFile events (create,
 * add and remove recipient, delete, transfer) are replayed with morse-sdk's
 * reconcile helper; the files that come out with a member besides the
 * owner are then read live, which gives their blob and current members.
 */

/** A RecipientFile, as read from chain, and the blob it is the access policy of. */
export interface RecipientFileRecord {
	fileId: string;
	name: string;
	owner: string;
	/** `null` when the file was created without one; the blob id still names it. */
	blobObjectId: string | null;
	blobId: string;
	members: readonly string[];
}

export type SharedFiles =
	| { kind: "complete"; files: readonly RecipientFileRecord[] }
	/** The count cannot be real; the reason says why. */
	| { kind: "unavailable"; reason: string };

const READS_AT_ONCE = 6;

export async function readSharedFiles(
	client: NetworkClient,
	network: NetworkConfig,
	owner: string,
	signal: AbortSignal,
): Promise<SharedFiles> {
	const sdk = await loadMorseSdk();
	const config = sdk.morseConfig({ network: network.id });
	const origin = config.recipientFileEventOriginPackageId;
	if (!origin)
		return {
			kind: "unavailable",
			reason: `morse-sdk has no RecipientFile events package for ${network.label}, so shared files cannot be found.`,
		};
	const { events, complete } = await readRecipientFileEvents({
		graphqlUrl: network.graphqlUrl,
		type: `${origin}::recipient_file`,
		sender: owner,
		signal,
	});
	if (!complete)
		return {
			kind: "unavailable",
			reason:
				"This wallet's access-policy history is longer than the app reads at once, so a count could miss files.",
		};
	const address = sdk.toSuiAddress(owner);
	const candidates = sdk
		.reconcileRecipientFilesOwnedBy(
			events,
			address,
			sdk.buildRecipientFileEventTypes(origin),
		)
		.filter((file) => file.members.some((member) => member !== address));

	const reader = sdk.RpcRecipientFilesReader.fromConfig(client, {
		packageId: config.packageId,
	});
	const files: RecipientFileRecord[] = [];
	for (let start = 0; start < candidates.length; start += READS_AT_ONCE) {
		const read = await Promise.all(
			candidates.slice(start, start + READS_AT_ONCE).map(async (candidate) => {
				try {
					return await reader.getRecipientFile(candidate.id, signal);
				} catch (error) {
					// Deleted since its last event was indexed: it shares nothing.
					if (
						error instanceof sdk.NotFoundError &&
						error.resource === "recipient-file"
					)
						return null;
					throw error;
				}
			}),
		);
		for (const file of read) {
			if (file === null) continue;
			files.push({
				fileId: file.id,
				name: file.name,
				owner: file.owner,
				blobObjectId: file.blobObjectId,
				blobId: file.blobId,
				members: file.members,
			});
		}
	}
	return { kind: "complete", files };
}
