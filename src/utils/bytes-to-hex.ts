/** Encode bytes as a lowercase hex string (no `0x` prefix). */
export function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (const byte of bytes) {
		out += byte.toString(16).padStart(2, "0");
	}
	return out;
}
