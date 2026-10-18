import type { RecipientFileEventInput } from "@arcadiasystems/morse-sdk";
import { querySuiGraphql } from "@/network/sui-graphql";

/**
 * A wallet's Morse RecipientFile events from Sui GraphQL (gRPC has no event
 * queries). RecipientFiles are shared objects, so they cannot be listed by
 * owner; the events the owner's transactions emitted can. `type` is a full
 * event type, or `{origin}::recipient_file` for every event of the module.
 */

/** Events per GraphQL page: the service's maximum. */
const PAGE_SIZE = 50;
/** Pages to read, newest first, before saying the history goes further back. */
const MAX_EVENT_PAGES = 10;

export interface RecipientFileEvents {
	/** Oldest first, as morse-sdk's reconcile helpers replay them. */
	events: RecipientFileEventInput[];
	/** `false` when older events exist beyond the pages read. */
	complete: boolean;
}

export async function readRecipientFileEvents({
	graphqlUrl,
	type,
	sender,
	signal,
}: {
	graphqlUrl: string;
	type: string;
	sender: string;
	signal: AbortSignal;
}): Promise<RecipientFileEvents> {
	const pages: RecipientFileEventInput[][] = [];
	let before: string | null = null;
	for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
		const data = await querySuiGraphql(
			graphqlUrl,
			`query($type: String!, $sender: SuiAddress!, $before: String) {
				events(filter: { type: $type, sender: $sender }, last: ${PAGE_SIZE}, before: $before) {
					pageInfo { hasPreviousPage startCursor }
					nodes { timestamp contents { type { repr } json } }
				}
			}`,
			{ type, sender, before },
			signal,
		);
		const { nodes, hasPreviousPage, startCursor } = parseEventsPage(data);
		pages.unshift(nodes);
		if (!hasPreviousPage || startCursor === null)
			return { events: pages.flat(), complete: true };
		before = startCursor;
	}
	return { events: pages.flat(), complete: false };
}

/**
 * One page of the events query, oldest first within the page.
 * @throws {Error} When the shape is unexpected.
 */
export function parseEventsPage(data: unknown): {
	nodes: RecipientFileEventInput[];
	hasPreviousPage: boolean;
	startCursor: string | null;
} {
	const events = (
		data as {
			events?: {
				pageInfo?: { hasPreviousPage?: unknown; startCursor?: unknown };
				nodes?: {
					timestamp?: unknown;
					contents?: { type?: { repr?: unknown }; json?: unknown };
				}[];
			};
		} | null
	)?.events;
	if (!events?.nodes || !events.pageInfo)
		throw new Error("Sui GraphQL returned no events page.");
	const nodes = events.nodes.flatMap((node): RecipientFileEventInput[] => {
		const type = node.contents?.type?.repr;
		const json = node.contents?.json;
		const timestampMs =
			typeof node.timestamp === "string" ? Date.parse(node.timestamp) : NaN;
		if (
			typeof type !== "string" ||
			typeof json !== "object" ||
			json === null ||
			Number.isNaN(timestampMs)
		)
			return [];
		return [{ type, json: json as Record<string, unknown>, timestampMs }];
	});
	const cursor = events.pageInfo.startCursor;
	return {
		nodes,
		hasPreviousPage: events.pageInfo.hasPreviousPage === true,
		startCursor: typeof cursor === "string" ? cursor : null,
	};
}
