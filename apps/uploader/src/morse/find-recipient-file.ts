import type { RecipientFile } from "@arcadiasystems/morse-sdk";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import { loadMorseSdk } from "./load-morse-sdk";

/**
 * Finds the Morse RecipientFile that is an encrypted blob's access policy
 * (PROTOCOL-NOTES section 11, option 1). A RecipientFile points at its blob,
 * not the other way round, and it is a shared object, so it cannot be
 * listed by owner. The wallet's `RecipientFileCreated` events can: they come
 * from Sui GraphQL, because gRPC has no event queries. The events carry the
 * file's name but not its blob, so files are read, likeliest first, until
 * one points at the blob.
 */

/** Events per GraphQL page: the service's maximum. */
const PAGE_SIZE = 50;
/** Pages of events to look through, newest first. */
const MAX_PAGES = 10;
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
	const events = await readCreatedEvents(
		network.graphqlUrl,
		`${origin}::recipient_file::RecipientFileCreated`,
		owner,
		signal,
	);
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

/** The owner's `RecipientFileCreated` events, newest first. */
async function readCreatedEvents(
	graphqlUrl: string,
	type: string,
	sender: string,
	signal: AbortSignal,
): Promise<CreatedEvent[]> {
	const events: CreatedEvent[] = [];
	let before: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const response = await fetch(graphqlUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				query: `query($type: String!, $sender: SuiAddress!, $before: String) {
					events(filter: { type: $type, sender: $sender }, last: ${PAGE_SIZE}, before: $before) {
						pageInfo { hasPreviousPage startCursor }
						nodes { contents { json } }
					}
				}`,
				variables: { type, sender, before },
			}),
			signal,
		});
		if (!response.ok)
			throw new Error(`Sui GraphQL answered ${response.status}.`);
		const { nodes, hasPreviousPage, startCursor } = parseEventsPage(
			await response.json(),
		);
		events.push(...nodes.reverse());
		if (!hasPreviousPage || startCursor === null) break;
		before = startCursor;
	}
	return events;
}

/**
 * One page of the events query.
 * @throws {Error} When GraphQL reports errors or the shape is unexpected.
 */
export function parseEventsPage(body: unknown): {
	nodes: CreatedEvent[];
	hasPreviousPage: boolean;
	startCursor: string | null;
} {
	const root = body as {
		data?: {
			events?: {
				pageInfo?: { hasPreviousPage?: unknown; startCursor?: unknown };
				nodes?: { contents?: { json?: unknown } }[];
			};
		};
		errors?: { message?: unknown }[];
	} | null;
	if (root?.errors?.length)
		throw new Error(
			`Sui GraphQL: ${root.errors.map((error) => String(error.message)).join("; ")}`,
		);
	const events = root?.data?.events;
	if (!events?.nodes || !events.pageInfo)
		throw new Error("Sui GraphQL returned no events page.");
	const nodes = events.nodes.flatMap((node): CreatedEvent[] => {
		const json = node.contents?.json as
			| { file?: unknown; name?: unknown }
			| undefined;
		return typeof json?.file === "string" && typeof json.name === "string"
			? [{ fileId: json.file, name: json.name }]
			: [];
	});
	const cursor = events.pageInfo.startCursor;
	return {
		nodes,
		hasPreviousPage: events.pageInfo.hasPreviousPage === true,
		startCursor: typeof cursor === "string" ? cursor : null,
	};
}
