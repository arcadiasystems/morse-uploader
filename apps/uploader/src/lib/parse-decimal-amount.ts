/**
 * Parses a token amount typed as a decimal ("0.05", "1", ".5") into raw
 * units with `decimals` places: `parseDecimalAmount("0.05", 9)` is
 * 50,000,000. Thousands separators and signs are not accepted.
 * @returns `null` when the text is not a plain decimal or has more places than `decimals`.
 */
export function parseDecimalAmount(
	text: string,
	decimals: number,
): bigint | null {
	const match = /^(\d*)(?:\.(\d*))?$/.exec(text.trim());
	if (!match) return null;
	const whole = match[1] ?? "";
	const fraction = match[2] ?? "";
	if (whole === "" && fraction === "") return null;
	if (fraction.length > decimals) return null;
	return BigInt(`${whole || "0"}${fraction.padEnd(decimals, "0")}`);
}
