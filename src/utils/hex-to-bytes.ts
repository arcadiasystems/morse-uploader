/**
 * Decode a hex string to bytes, rejecting anything that is not valid hex.
 *
 * Throws rather than coercing. The previous version relied on TypedArray's
 * NaN -> 0 coercion, so "zzzz" decoded to [0, 0] and an odd-length "abc" to
 * [171] with the trailing nibble dropped. Both produced a plausible-looking
 * byte array from damaged input, which then failed much later inside Seal's
 * decrypt with an error that pointed nowhere near the real cause.
 */
export function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	if (clean.length % 2 !== 0) {
		throw new Error(
			`Invalid hex: expected an even number of digits, got ${clean.length}.`,
		);
	}
	if (!/^[0-9a-fA-F]*$/.test(clean)) {
		throw new Error("Invalid hex: expected only the digits 0-9 and a-f.");
	}
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < bytes.length; i += 1) {
		bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}
