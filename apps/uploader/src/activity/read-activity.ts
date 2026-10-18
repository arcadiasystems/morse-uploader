import { loadMorseSdk } from "@/morse/load-morse-sdk";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import { querySuiGraphql } from "@/network/sui-graphql";
import {
	type ActivityItem,
	type ActivityTypes,
	classifyTransaction,
	parseTransactionsPage,
} from "./activity";

/** Sent transactions to look through, newest first. */
const LOOKBACK = 25;
/** Rows the Overview shows. */
const ACTIVITY_ROWS = 6;

/**
 * The wallet's most recent Walrus and Morse transactions, newest first:
 * the last 25 it sent, of which the Walrus and Morse actions are kept.
 */
export async function readActivity(
	client: NetworkClient,
	network: NetworkConfig,
	owner: string,
	signal: AbortSignal,
): Promise<ActivityItem[]> {
	const [blob, sdk, data] = await Promise.all([
		client.walrus.getBlobType(),
		loadMorseSdk(),
		querySuiGraphql(
			network.graphqlUrl,
			`query($sender: SuiAddress!) {
				transactions(filter: { sentAddress: $sender }, last: ${LOOKBACK}) {
					nodes {
						digest
						effects {
							status
							timestamp
							objectChanges(first: 50) {
								nodes {
									address
									inputState { asMoveObject { contents { type { repr } } } }
									outputState { asMoveObject { contents { type { repr } } } }
								}
							}
							events(first: 10) { nodes { contents { type { repr } json } } }
						}
						kind {
							... on ProgrammableTransaction {
								commands(first: 50) {
									nodes { ... on MoveCallCommand { function { name module { name } } } }
								}
							}
						}
					}
				}
			}`,
			{ sender: owner },
			signal,
		),
	]);
	const config = sdk.morseConfig({ network: network.id });
	const morseTypes = config.originalPackageId ?? config.packageId;
	const types: ActivityTypes = {
		blob,
		publication: `${morseTypes}::publication::Publication`,
		recipientFile: config.recipientFileEventOriginPackageId
			? `${config.recipientFileEventOriginPackageId}::recipient_file::RecipientFile`
			: null,
	};
	return parseTransactionsPage(data)
		.flatMap((transaction) => classifyTransaction(transaction, types) ?? [])
		.slice(0, ACTIVITY_ROWS);
}
