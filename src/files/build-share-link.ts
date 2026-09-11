import { bytesToHex } from "../utils/bytes-to-hex.js";
import { resolveOrigin } from "../utils/resolve-origin.js";
import { trimTrailingSlashes } from "../utils/trim-trailing-slashes.js";
import type { BuildShareLinkArgs } from "./types.js";

const DEFAULT_PATTERN = "/#/f/:fileId";

/**
 * Build a share link for a RecipientFile. The fileId goes in the URL fragment,
 * with the network as `net` and the Seal material (prefix + nonce, if any) as
 * hex `p`/`n` queries inside that fragment, so none of it reaches a server log.
 * The seal material is not a secret: decryption is still gated by the file's
 * recipient set. SSR-safe (falls back to an empty base outside a browser).
 */
export function buildShareLink(args: BuildShareLinkArgs): string {
	const base = trimTrailingSlashes(args.baseUrl ?? resolveOrigin() ?? "");
	const path = (args.pattern ?? DEFAULT_PATTERN).replace(
		":fileId",
		encodeURIComponent(args.fileId),
	);
	const params: string[] = [];
	if (args.network !== undefined) {
		params.push(`net=${args.network}`);
	}
	if (args.sealIdPrefix !== undefined && args.sealNonce !== undefined) {
		params.push(`p=${bytesToHex(args.sealIdPrefix)}`);
		params.push(`n=${bytesToHex(args.sealNonce)}`);
	}
	const query = params.length === 0 ? "" : `?${params.join("&")}`;
	return `${base}${path}${query}`;
}
