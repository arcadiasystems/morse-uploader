/**
 * Renders a raw integer amount as an exact decimal string, without grouping or
 * trailing zeros: `toDecimalString(225962348n, 9)` is `"0.225962348"`.
 * @throws {RangeError} When `raw` is negative or `decimals` is not a non-negative integer.
 */
export function toDecimalString(raw: bigint, decimals: number): string {
	if (raw < 0n) throw new RangeError("Token amounts are never negative.");
	if (!Number.isInteger(decimals) || decimals < 0) {
		throw new RangeError("Decimals must be a non-negative integer.");
	}
	if (decimals === 0) return raw.toString();
	const scale = 10n ** BigInt(decimals);
	const whole = raw / scale;
	const fraction = (raw % scale)
		.toString()
		.padStart(decimals, "0")
		.replace(/0+$/, "");
	return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}
