import { groupThousands } from "./group-thousands";
import { roundToDecimals } from "./round-to-decimals";

/** How a token amount is displayed; a subscript renders its zero count in `<sub>`. */
export type FormattedAmount =
	| { kind: "missing" }
	| { kind: "plain"; text: string }
	| { kind: "subscript"; zeros: number; digits: string };

/** `compact` for the top bar and lists, `detailed` for exact views. */
export type AmountContext = "compact" | "detailed";

const SUBSCRIPT_MIN_ZEROS = 3;
const SIGNIFICANT_DIGITS: Record<AmountContext, number> = {
	compact: 2,
	detailed: 4,
};
const ABBREVIATIONS = ["K", "M", "B", "T"] as const;

/**
 * Formats a raw token amount (FROST or MIST, 9 decimals for WAL and SUI).
 *
 * - `null` is shown as `--`, and zero as `0`.
 * - Values with three or more zeros after the point use a zero-subscript:
 *   0.000447 is `0.0₃44` compact and `0.0₃4466` detailed.
 * - Compact: 1,000 and up abbreviate (`1.2K`); 1 and up keep 2 decimals;
 *   below 1 keep 4. Rounding is half away from zero, trailing zeros trimmed.
 * - Detailed: the exact value with thousands separators.
 * @throws {RangeError} When `raw` is negative.
 */
export function formatTokenAmount(
	raw: bigint | null,
	decimals: number,
	context: AmountContext,
): FormattedAmount {
	if (raw === null) return { kind: "missing" };
	if (raw < 0n) throw new RangeError("Token amounts are never negative.");
	if (raw === 0n) return { kind: "plain", text: "0" };

	const scale = 10n ** BigInt(decimals);
	const subscript = toSubscript(
		raw,
		decimals,
		scale,
		SIGNIFICANT_DIGITS[context],
	);
	if (subscript) return subscript;

	if (context === "detailed")
		return { kind: "plain", text: joinParts(raw, decimals, scale) };
	if (raw / scale >= 1000n)
		return { kind: "plain", text: abbreviate(raw, scale) };
	const keep = raw >= scale ? 2 : 4;
	return {
		kind: "plain",
		text: joinParts(roundToDecimals(raw, decimals, keep), decimals, scale),
	};
}

function toSubscript(
	raw: bigint,
	decimals: number,
	scale: bigint,
	significant: number,
): FormattedAmount | null {
	const zeros = leadingFractionZeros(raw, decimals, scale);
	if (zeros < SUBSCRIPT_MIN_ZEROS) return null;
	const rounded = roundToDecimals(
		raw,
		decimals,
		Math.min(decimals, zeros + significant),
	);
	const roundedZeros = leadingFractionZeros(rounded, decimals, scale);
	if (roundedZeros < SUBSCRIPT_MIN_ZEROS) return null;
	const fraction = (rounded % scale).toString().padStart(decimals, "0");
	const digits = fraction
		.slice(roundedZeros, roundedZeros + significant)
		.replace(/0+$/, "");
	return { kind: "subscript", zeros: roundedZeros, digits };
}

/** Zeros between the point and the first significant digit, or 0 when the value is 1 or more. */
function leadingFractionZeros(
	raw: bigint,
	decimals: number,
	scale: bigint,
): number {
	if (raw >= scale) return 0;
	const fraction = (raw % scale).toString().padStart(decimals, "0");
	return fraction.length - fraction.replace(/^0+/, "").length;
}

function joinParts(raw: bigint, decimals: number, scale: bigint): string {
	const whole = groupThousands((raw / scale).toString());
	const fraction = (raw % scale)
		.toString()
		.padStart(decimals, "0")
		.replace(/0+$/, "");
	return fraction === "" ? whole : `${whole}.${fraction}`;
}

function abbreviate(raw: bigint, scale: bigint): string {
	let unit = 1000n;
	let index = 0;
	let tenths = roundedTenths(raw, scale * unit);
	while (tenths >= 10_000n && index < ABBREVIATIONS.length - 1) {
		unit *= 1000n;
		index += 1;
		tenths = roundedTenths(raw, scale * unit);
	}
	const whole = groupThousands((tenths / 10n).toString());
	const decimal = tenths % 10n;
	return `${decimal === 0n ? whole : `${whole}.${decimal}`}${ABBREVIATIONS[index]}`;
}

function roundedTenths(raw: bigint, divisor: bigint): bigint {
	return (raw * 10n + divisor / 2n) / divisor;
}
