// Binary (1024-based) units, ordered from smallest to largest.
const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;
const BASE = 1024;

/**
 * Format a byte count as a human-readable size (e.g. 2348 -> "2.29 KB").
 *
 * Uses binary units. Whole bytes are shown without a fraction; larger units use
 * `fractionDigits` decimals. Non-finite or non-positive input returns "0 B".
 */
export function formatBytes(bytes: number, fractionDigits = 2): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 B";
	}
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(BASE)),
		UNITS.length - 1,
	);
	const value = bytes / BASE ** exponent;
	const unit = UNITS[exponent] ?? "B";
	// Bytes are always whole, so skip the fractional part for the base unit.
	if (exponent === 0) {
		return `${value} ${unit}`;
	}
	return `${value.toFixed(fractionDigits)} ${unit}`;
}
