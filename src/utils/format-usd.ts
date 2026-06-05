// Below this the figure is not worth showing precisely; display a floor.
const TINY_FLOOR = 0.000001;

/**
 * Format a USD amount for display. A cent or more uses two decimals; sub-cent
 * amounts (common for short Walrus leases) show two significant digits in plain
 * decimal notation; amounts below a millionth of a dollar show a `< $` floor.
 * Never uses scientific notation.
 */
export function formatUsd(usd: number): string {
	if (usd <= 0) {
		return "$0.00";
	}
	if (usd >= 0.01) {
		return `$${usd.toFixed(2)}`;
	}
	if (usd < TINY_FLOOR) {
		return `< $${TINY_FLOOR}`;
	}
	return `$${usd.toLocaleString("en-US", {
		maximumSignificantDigits: 2,
		useGrouping: false,
	})}`;
}
