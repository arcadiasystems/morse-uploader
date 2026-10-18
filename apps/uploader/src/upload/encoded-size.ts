/**
 * Walrus RS2 encoding sizes, from PROTOCOL-NOTES sections 1 and 3 (the same
 * formula as `encoded_blob_length_for_n_shards` in walrus-core and
 * `redstuff.move`). Storage and the write fee are billed on the encoded size.
 */

/** Storage is billed per started MiB of encoded size. */
export const STORAGE_UNIT_BYTES = 1_048_576n;

/** RS2 symbols are at most `u16::MAX - 1` bytes (notes section 1). */
export const MAX_SYMBOL_BYTES = 65_534;

/** Bytes per hash in the per-blob metadata: two per shard, plus the blob id. */
const DIGEST_BYTES = 32n;

export interface SourceSymbols {
	/** Rows of the encoding matrix: 334 on 1000 shards. */
	primary: number;
	/** Columns of the encoding matrix: 667 on 1000 shards. */
	secondary: number;
}

/**
 * The RS2 source symbol counts for `nShards` shards: with
 * `f = floor((n - 1) / 3)` faulty shards tolerated, `n - 2f` primary and
 * `n - f` secondary symbols.
 */
export function sourceSymbols(nShards: number): SourceSymbols {
	const maxFaulty = Math.floor((nShards - 1) / 3);
	return { primary: nShards - 2 * maxFaulty, secondary: nShards - maxFaulty };
}

/**
 * The symbol size for `size` unencoded bytes: the bytes spread over the
 * `primary × secondary` source symbols, rounded up to an even count (RS2
 * alignment). An empty blob is encoded as one byte.
 */
export function symbolSizeFor(size: number, nShards: number): number {
	const { primary, secondary } = sourceSymbols(nShards);
	const symbol =
		Math.floor((Math.max(size, 1) - 1) / (primary * secondary)) + 1;
	return symbol % 2 === 1 ? symbol + 1 : symbol;
}

/**
 * The encoded size of a blob of `size` bytes:
 * `n × (n × 32 × 2 + 32) + (primary + secondary) × symbol × n`. On 1000
 * shards that is 64,032,000 bytes of fixed metadata plus 1,001,000 bytes per
 * symbol byte, about 4.49 times the blob for large ones.
 */
export function encodedBlobSize(size: number, nShards: number): bigint {
	const { primary, secondary } = sourceSymbols(nShards);
	const n = BigInt(nShards);
	const metadata = n * (n * DIGEST_BYTES * 2n + DIGEST_BYTES);
	const slivers =
		BigInt(primary + secondary) * BigInt(symbolSizeFor(size, nShards)) * n;
	return metadata + slivers;
}

/** The storage units (started MiB) an encoded size is billed for. */
export function storageUnits(encodedSize: bigint): bigint {
	return (encodedSize + STORAGE_UNIT_BYTES - 1n) / STORAGE_UNIT_BYTES;
}
