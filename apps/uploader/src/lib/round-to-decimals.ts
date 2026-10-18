/**
 * Rounds a raw integer amount (scaled by `10^decimals`) to `keep` fractional
 * digits, half away from zero, and returns it at the same scale.
 * `roundToDecimals(225962348n, 9, 4)` is `226000000n` (0.2260).
 */
export function roundToDecimals(
	raw: bigint,
	decimals: number,
	keep: number,
): bigint {
	if (keep >= decimals) return raw;
	const step = 10n ** BigInt(decimals - keep);
	return ((raw + step / 2n) / step) * step;
}
