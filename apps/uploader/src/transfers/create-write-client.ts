import { SuiGrpcClient } from "@mysten/sui/grpc";
import { WalrusClient } from "@mysten/walrus";
import { NETWORKS, type NetworkId } from "@/network/networks";

/**
 * The relay's default request timeout is 30 s (PROTOCOL-NOTES section 6),
 * too short for a large upload. The Walrus browser example uses 10 minutes.
 */
const RELAY_TIMEOUT_MS = 600_000;

export interface WriteClientOptions {
	network: NetworkId;
	/** The most tip the SDK may send to the relay, in MIST: `sendTip: { max }`. */
	tipMaxMist: number;
	/** Used for relay requests, so an upload can report its progress. */
	fetch?: typeof globalThis.fetch;
}

/**
 * A Walrus client that writes through the upload relay. Each upload gets a
 * fresh one on a fresh Sui client, for two reasons: the SDK caches the tip
 * config together with the first `max` it was given in the Sui client's
 * cache, and the register transaction must be built on current prices
 * (notes section 4: a price change between build and execute aborts it).
 */
export function createWriteClient({
	network,
	tipMaxMist,
	fetch,
}: WriteClientOptions): WalrusClient {
	const config = NETWORKS[network];
	return new WalrusClient({
		network,
		suiClient: new SuiGrpcClient({ network, baseUrl: config.grpcUrl }),
		uploadRelay: {
			host: config.uploadRelayUrl,
			sendTip: { max: tipMaxMist },
			timeout: RELAY_TIMEOUT_MS,
			...(fetch ? { fetch } : {}),
		},
	});
}
