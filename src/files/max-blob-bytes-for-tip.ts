import type { TipStrategy } from "@mysten/walrus";

// Walrus RS2 encoding for the shard count Testnet and Walrus Mainnet both run.
// The SDK reads n_shards from the system object; it is fixed when a Walrus
// system is created, so it is a constant here. The derivation follows
// @mysten/walrus's getSourceSymbols (RS2 has no decoding safety limit) and
// encodedBlobLength.
const N_SHARDS = 1000;
const MAX_FAULTY_SHARDS = Math.floor((N_SHARDS - 1) / 3);
const PRIMARY_SYMBOLS = N_SHARDS - 2 * MAX_FAULTY_SHARDS;
const SECONDARY_SYMBOLS = N_SHARDS - MAX_FAULTY_SHARDS;
/** Unencoded bytes per unit of symbol size: 334 * 667 = 222,778. */
const BYTES_PER_SYMBOL = BigInt(PRIMARY_SYMBOLS * SECONDARY_SYMBOLS);
/** Encoded bytes per unit of symbol size, over all slivers: 1,001,000. */
const ENCODED_BYTES_PER_SYMBOL = BigInt(
	(PRIMARY_SYMBOLS + SECONDARY_SYMBOLS) * N_SHARDS,
);
/** Per shard, two 32-byte digests for every shard and a 32-byte blob id: 64,032,000. */
const METADATA_BYTES = BigInt(N_SHARDS * (N_SHARDS * 32 * 2 + 32));
const BYTES_PER_KIB = 1024n;

/**
 * The largest blob, in bytes, whose upload relay tip is at most `maxTipMist`.
 * `null` when the tip does not grow with size and fits under the cap, so the
 * cap sets no size limit. `0` when no blob fits, not even an empty one, since
 * Walrus encodes an empty blob as one byte.
 *
 * Inverts the tip `@mysten/walrus` 1.2.35 computes in `calculateUploadRelayTip`:
 *
 *     symbols = floor((max(size, 1) - 1) / 222,778) + 1, rounded up to even
 *     encoded = 64,032,000 + 1,001,000 * symbols
 *     tip     = base + perEncodedKib * ceil(encoded / 1024)    (linear)
 *     tip     = const                                          (const)
 *
 * The tip changes only when `symbols` does, in steps of two, and a blob of
 * `symbols * 222,778` bytes is the largest at each step. The limit is that
 * size for the largest even `symbols` whose tip fits.
 */
export function maxBlobBytesForTip(
	strategy: TipStrategy,
	maxTipMist: bigint,
): number | null {
	if ("const" in strategy) {
		return BigInt(strategy.const) <= maxTipMist ? null : 0;
	}
	const base = BigInt(strategy.linear.base);
	const perEncodedKib = BigInt(strategy.linear.perEncodedKib);
	if (perEncodedKib === 0n) {
		return base <= maxTipMist ? null : 0;
	}
	// ceil(encoded / 1024) <= maxKib exactly when encoded <= maxKib * 1024.
	// A base above the cap leaves this at or below zero, under the metadata.
	const maxEncodedBytes = ((maxTipMist - base) / perEncodedKib) * BYTES_PER_KIB;
	if (maxEncodedBytes < METADATA_BYTES) {
		return 0;
	}
	const symbols = (maxEncodedBytes - METADATA_BYTES) / ENCODED_BYTES_PER_SYMBOL;
	const evenSymbols = symbols - (symbols % 2n);
	return Number(evenSymbols * BYTES_PER_SYMBOL);
}
