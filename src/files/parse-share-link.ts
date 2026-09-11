import { hexToBytes } from "../utils/hex-to-bytes.js";
import type { ParsedShareLink } from "./types.js";

// Matches the fragment shape "f/<fileId>" optionally followed by a query.
const FRAGMENT_RE = /^\/?f\/([^?]+)(?:\?(.*))?$/;

/**
 * Parse a share link produced by {@link buildShareLink}. Reads the fileId, the
 * network, and the optional Seal material (prefix + nonce) from the URL
 * fragment. Returns null when the fragment does not match the expected shape;
 * `sealIdPrefix`/`sealNonce` are null for a public file (no seal material in
 * the link), and `network` is null for a link that omits it.
 *
 * A damaged link is null, never a public file. The seal params are a pair, so a
 * link carrying only one of them, or either one in unparseable hex, is rejected
 * rather than downgraded: reporting it as public would make the caller skip
 * decrypt and hand raw ciphertext to the user as if it were the file.
 */
export function parseShareLink(href: string): ParsedShareLink | null {
	const hashIndex = href.indexOf("#");
	const fragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : href;
	const match = FRAGMENT_RE.exec(fragment);
	const rawFileId = match?.[1];
	if (rawFileId === undefined) {
		return null;
	}
	const fileId = decodeURIComponent(rawFileId);
	const params = new URLSearchParams(match?.[2] ?? "");
	const network = parseNetwork(params.get("net"));
	const prefix = params.get("p");
	const nonce = params.get("n");
	if (prefix === null && nonce === null) {
		return { fileId, network, sealIdPrefix: null, sealNonce: null };
	}
	if (prefix === null || nonce === null) {
		return null;
	}
	try {
		return {
			fileId,
			network,
			sealIdPrefix: hexToBytes(prefix),
			sealNonce: hexToBytes(nonce),
		};
	} catch {
		return null;
	}
}

// An unknown value is null, not a rejected link: a future network name should
// leave the caller on its own default rather than break the whole link.
function parseNetwork(value: string | null): "testnet" | "mainnet" | null {
	if (value === "testnet" || value === "mainnet") {
		return value;
	}
	return null;
}
