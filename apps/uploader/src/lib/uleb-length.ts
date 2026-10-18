/** Bytes of a non-negative integer as ULEB128, BCS's length prefix: seven bits per byte. */
export function ulebLength(value: number): number {
	let bytes = 1;
	let rest = Math.floor(value / 128);
	while (rest > 0) {
		bytes += 1;
		rest = Math.floor(rest / 128);
	}
	return bytes;
}
