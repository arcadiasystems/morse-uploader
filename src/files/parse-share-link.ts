import { hexToBytes } from "../utils/hex-to-bytes.js";
import type { ParsedShareLink } from "./types.js";

// Matches the fragment shape "f/<fileId>" optionally followed by a query.
const FRAGMENT_RE = /^\/?f\/([^?]+)(?:\?(.*))?$/;

/**
 * Parse a share link produced by {@link buildShareLink}. Reads the fileId and
 * optional Seal material (prefix + nonce) from the URL fragment. Returns null
 * when the fragment does not match the expected shape; `sealIdPrefix`/`sealNonce`
 * are null for a public file (no seal material in the link).
 */
export function parseShareLink(href: string): ParsedShareLink | null {
	const hashIndex = href.indexOf("#");
	const fragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : href;
	const match = FRAGMENT_RE.exec(fragment);
	const rawFileId = match?.[1];
	if (rawFileId === undefined) {
		return null;
	}
	const params = new URLSearchParams(match?.[2] ?? "");
	const prefix = params.get("p");
	const nonce = params.get("n");
	const hasSeal = prefix !== null && nonce !== null;
	return {
		fileId: decodeURIComponent(rawFileId),
		sealIdPrefix: hasSeal ? hexToBytes(prefix) : null,
		sealNonce: hasSeal ? hexToBytes(nonce) : null,
	};
}
