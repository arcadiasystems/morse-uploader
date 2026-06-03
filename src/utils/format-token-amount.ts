// Both WAL (FROST) and SUI (MIST) use 9 base units of precision per token.
const BASE_UNITS_PER_TOKEN = 1_000_000_000n;
const DECIMALS = 9;

/**
 * Format a base-unit amount (MIST or FROST) as a decimal token string, e.g.
 * formatTokenAmount(1500000000n) -> "1.5000". `fractionDigits` truncates (does
 * not round) the fractional part.
 */
export function formatTokenAmount(
	baseUnits: bigint,
	fractionDigits = 4,
): string {
	const negative = baseUnits < 0n;
	const abs = negative ? -baseUnits : baseUnits;
	const whole = abs / BASE_UNITS_PER_TOKEN;
	const sign = negative ? "-" : "";
	if (fractionDigits <= 0) {
		return `${sign}${whole}`;
	}
	const fraction = (abs % BASE_UNITS_PER_TOKEN)
		.toString()
		.padStart(DECIMALS, "0")
		.slice(0, fractionDigits);
	return `${sign}${whole}.${fraction}`;
}
