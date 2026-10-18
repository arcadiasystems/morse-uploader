const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * A byte count in decimal units, as the design shows sizes: `19 B`, `2.3 MB`,
 * `446 KB`. One decimal below 10, whole numbers from 10 up, rounded half up,
 * and a value that rounds to 1,000 moves to the next unit.
 * @throws {RangeError} When `bytes` is negative.
 */
export function formatBytes(bytes: bigint): string {
	if (bytes < 0n) throw new RangeError("Byte counts are never negative.");
	if (bytes < 1000n) return `${bytes} B`;
	let index = 1;
	let unit = 1000n;
	while (index < UNITS.length - 1 && bytes >= unit * 1000n) {
		unit *= 1000n;
		index += 1;
	}
	const tenths = (bytes * 10n + unit / 2n) / unit;
	if (tenths < 100n) {
		const decimal = tenths % 10n;
		return `${tenths / 10n}${decimal === 0n ? "" : `.${decimal}`} ${UNITS[index]}`;
	}
	const whole = (bytes + unit / 2n) / unit;
	if (whole >= 1000n && index < UNITS.length - 1) {
		return `1 ${UNITS[index + 1]}`;
	}
	return `${whole} ${UNITS[index]}`;
}
