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
	 * Mysten's public aggregator (PROTOCOL-NOTES section 10, docs
	 * network-reference "Aggregators and publishers"). Answers with CORS `*`.
	 */
	aggregatorUrl: string;
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
	topUp: readonly TopUpLink[];
}

export const NETWORKS: Readonly<Record<NetworkId, NetworkConfig>> = {
	testnet: {
		id: "testnet",
		label: "Testnet",
		walrusLabel: "Walrus Testnet",
		grpcUrl: "https://fullnode.testnet.sui.io:443",
		aggregatorUrl: "https://aggregator.walrus-testnet.walrus.space",
		walCoinType: { kind: "chain" },
		epochDays: 1,
		maxEpochsAhead: 53,
		// register 3,975,376 + certify 1,030,696
		uploadGasMist: 5_006_072n,
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
		aggregatorUrl: "https://aggregator.walrus-mainnet.walrus.space",
		walCoinType: {
			kind: "fixed",
			coinType:
				"0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
		},
		epochDays: 14,
		maxEpochsAhead: 53,
		// register 2,134,878 + certify 173,696
		uploadGasMist: 2_308_574n,
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
