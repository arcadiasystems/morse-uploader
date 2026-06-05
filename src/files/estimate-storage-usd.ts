import type { UsdCostArgs, UsdCostEstimate } from "./types.js";

// Walrus predictable pricing: $0.023 per GB per month, paid in WAL but pegged.
// https://blog.walrus.xyz/announcing-predictable-pricing-in-usd-on-walrus/
const DEFAULT_USD_PER_GB_PER_MONTH = 0.023;
const BYTES_PER_GB = 1_000_000_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30 * MS_PER_DAY;

/**
 * Estimate Walrus storage cost in USD from a blob size and a storage duration.
 * Duration is given in epochs plus the epoch length (read from chain), since an
 * epoch is 1 day on testnet and 2 weeks on mainnet. Encryption overhead can be
 * folded in so the encrypt toggle moves the figure.
 */
export function estimateStorageUsd(args: UsdCostArgs): UsdCostEstimate {
	const sizeBytes = args.sizeBytes + (args.encryptionOverheadBytes ?? 0);
	const gb = sizeBytes / BYTES_PER_GB;
	const totalMs = args.epochs * args.epochDurationMs;
	const months = totalMs / MS_PER_MONTH;
	const days = totalMs / MS_PER_DAY;
	const rate = args.usdPerGbPerMonth ?? DEFAULT_USD_PER_GB_PER_MONTH;
	return { usd: gb * months * rate, gb, months, days, sizeBytes };
}
