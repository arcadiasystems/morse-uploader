/** True when both byte arrays have the same length and the same bytes. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return a.every((byte, index) => byte === b[index]);
}
