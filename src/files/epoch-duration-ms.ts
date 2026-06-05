/** One day in milliseconds. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Walrus epoch length per network: testnet ~1 day, mainnet ~2 weeks. */
const EPOCH_DURATION_MS: Record<"testnet" | "mainnet", number> = {
	testnet: ONE_DAY_MS,
	mainnet: 14 * ONE_DAY_MS,
};

/**
 * Nominal Walrus epoch length in milliseconds for a network. Used by the USD
 * cost estimate to convert an epoch count into months. These are the documented
 * nominal lengths (testnet 1 day, mainnet 2 weeks), not a live chain read.
 */
export function epochDurationMs(network: "testnet" | "mainnet"): number {
	return EPOCH_DURATION_MS[network];
}
