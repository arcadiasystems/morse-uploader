/**
 * The two networks Morse Uploader supports. Values come from
 * design/PROTOCOL-NOTES.md and the Walrus network reference
 * (https://docs.wal.app/docs/network-reference); see the notes for sources.
 */
export const NETWORK_IDS = ["testnet", "mainnet"] as const;

export type NetworkId = (typeof NETWORK_IDS)[number];

export const DEFAULT_NETWORK: NetworkId = "testnet";

/**
 * Where the WAL coin type comes from. Walrus Mainnet package ids are fixed
 * between upgrades, so its type is a constant. Testnet package ids change on
 * every redeploy, so its type is read from chain at runtime.
 */
export type WalCoinTypeSource =
	| { kind: "fixed"; coinType: string }
	| { kind: "chain" };

/**
 * Whether the upload sheet can Seal-encrypt on a network. Encryption needs
 * key servers that will later serve decryption keys to the browser without
 * a credential (PROTOCOL-NOTES section 11).
 */
export type SealAvailability =
	| { kind: "available" }
	| { kind: "unavailable"; reason: string };

/**
 * Net gas (computation + storage - rebate) observed on chain for the
 * transactions the upload flow cannot simulate before it signs, in MIST.
 * The register transaction is simulated instead.
 */
export interface ObservedGas {
	/** One `certify_blob` (PROTOCOL-NOTES section 4). */
	certifyMist: bigint;
	/** One morse-sdk `addEntry` (`add_entry_to_collection`). */
	entryMist: bigint;
	/** One morse-sdk `createEncryptedRecipientFile`; `null` where Seal is unavailable. */
	recipientFileMist: bigint | null;
}

/** An official place to get tokens for a network. Never an exchange we pick. */
export interface TopUpLink {
	title: string;
	detail: string;
	href: string;
}

export interface NetworkConfig {
	id: NetworkId;
	/** The network's name in the switch and the top bar chip. */
	label: string;
	/** The Walrus pane title. */
	walrusLabel: string;
	/** Sui full node; one URL serves gRPC for both networks. */
	grpcUrl: string;
	/**
	 * Sui GraphQL, for event queries gRPC does not offer: finding the Morse
	 * RecipientFile of an encrypted blob. Answers with CORS `*`.
	 */
	graphqlUrl: string;
	/**
	 * Mysten's public aggregator (PROTOCOL-NOTES section 10, docs
	 * network-reference "Aggregators and publishers"). Answers with CORS `*`.
	 */
	aggregatorUrl: string;
	/**
	 * Mysten's public upload relay (notes section 4, docs network-reference
	 * "Upload relays"): browsers write through it with one request instead of
	 * about 2,200 to storage nodes. Answers with CORS `*`.
	 */
	uploadRelayUrl: string;
	/** Suiscan for this network: objects at `/object/{id}`, transactions at `/tx/{digest}`. */
	explorerUrl: string;
	walCoinType: WalCoinTypeSource;
	/** Fixed system parameters (network reference, "Network parameters"). */
	epochDays: number;
	maxEpochsAhead: number;
	/**
	 * Net gas for one upload's two transactions, register and certify, in MIST.
	 * Observed on chain on 2026-10-17 (PROTOCOL-NOTES section 4); the upload
	 * sheet replaces it with a simulated figure for the exact transaction.
	 */
	uploadGasMist: bigint;
	observedGas: ObservedGas;
	seal: SealAvailability;
	topUp: readonly TopUpLink[];
}

export const NETWORKS: Readonly<Record<NetworkId, NetworkConfig>> = {
	testnet: {
		id: "testnet",
		label: "Testnet",
		walrusLabel: "Walrus Testnet",
		grpcUrl: "https://fullnode.testnet.sui.io:443",
		graphqlUrl: "https://graphql.testnet.sui.io/graphql",
		aggregatorUrl: "https://aggregator.walrus-testnet.walrus.space",
		uploadRelayUrl: "https://upload-relay.testnet.walrus.space",
		explorerUrl: "https://suiscan.xyz/testnet",
		walCoinType: { kind: "chain" },
		epochDays: 1,
		maxEpochsAhead: 53,
		// register 3,975,376 + certify 1,030,696
		uploadGasMist: 5_006_072n,
		observedGas: {
			// Testnet certify, 2026-10-18, e.g. GS8YBWbAgU28777EB3KqpYRMsMpAmiw54xh3q2uT4emF.
			certifyMist: 1_030_696n,
			// The highest of recent add_entry_to_collection transactions,
			// 2026-10-17: HAQ338U6Rk9RCzwwwo6rm49vo7mp5B56rFNEptDpewuf.
			entryMist: 3_972_353n,
			// This app's own createEncryptedRecipientFile in the phase 3 e2e run,
			// 2026-10-18: DdjTt9rnSD8AnjmexEd8oqV1aomzz6pSVtxJnJT62SfW.
			recipientFileMist: 5_803_299n,
		},
		// Mysten's two open Testnet key servers, which morse-sdk pins.
		seal: { kind: "available" },
		topUp: [
			{
				title: "Sui faucet",
				detail: "Free Testnet SUI. Paste your address and pick Testnet.",
				href: "https://faucet.sui.io/",
			},
			{
				title: "Get WAL in the Walrus staking app",
				detail: "Exchange Testnet SUI for WAL at 1:1.",
				href: "https://stake-wal.wal.app/",
			},
			{
				title: "Testnet tokens guide",
				detail: "Walrus docs on faucets and the official exchange.",
				href: "https://docs.wal.app/docs/testnet-reference#tokens-and-faucets",
			},
		],
	},
	mainnet: {
		id: "mainnet",
		label: "Walrus Mainnet",
		walrusLabel: "Walrus Mainnet",
		grpcUrl: "https://fullnode.mainnet.sui.io:443",
		graphqlUrl: "https://graphql.mainnet.sui.io/graphql",
		aggregatorUrl: "https://aggregator.walrus-mainnet.walrus.space",
		uploadRelayUrl: "https://upload-relay.mainnet.walrus.space",
		explorerUrl: "https://suiscan.xyz/mainnet",
		walCoinType: {
			kind: "fixed",
			coinType:
				"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
		},
		epochDays: 14,
		maxEpochsAhead: 53,
		// register 2,134,878 + certify 173,696
		uploadGasMist: 2_308_574n,
		observedGas: {
			certifyMist: 173_696n,
			// The highest of morse-sdk's Walrus Mainnet add_entry_to_collection
			// runs, 2026-09-09: EPjwdcpiuBMA7BEqRD1AJXLNnQafgKQkEvTN9S37E8pX.
			entryMist: 2_917_396n,
			recipientFileMist: null,
		},
		seal: {
			kind: "unavailable",
			reason:
				"Every Seal key server on Walrus Mainnet is commercial and needs its own credential to decrypt. Morse Uploader holds none, so encrypting here would store files nobody could read back.",
		},
		topUp: [
			{
				title: "WAL token page",
				detail: "The Walrus Foundation's list of where WAL is available.",
				href: "https://walrus.xyz/wal-token/",
			},
			{
				title: "Getting SUI",
				detail:
					"Sui docs. There is no faucet on Walrus Mainnet; SUI is bought.",
				href: "https://docs.sui.io/getting-started/onboarding/get-coins",
			},
		],
	},
};
