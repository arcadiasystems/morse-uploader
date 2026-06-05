import { bytesToHex } from "../utils/bytes-to-hex.js";
import { resolveOrigin } from "../utils/resolve-origin.js";
import { trimTrailingSlashes } from "../utils/trim-trailing-slashes.js";
import type { BuildShareLinkArgs } from "./types.js";

const DEFAULT_PATTERN = "/#/f/:fileId";

/**
 * Build a share link for a RecipientFile. The fileId goes in the URL fragment
 * and the Seal material (prefix + nonce, if any) as hex `p`/`n` queries inside
 * the fragment, so they never reach a server log. The seal material is not a
 * secret: decryption is still gated by the file's recipient set. SSR-safe
 * (falls back to an empty base outside a browser).
 */
export function buildShareLink(args: BuildShareLinkArgs): string {
	const base = trimTrailingSlashes(args.baseUrl ?? resolveOrigin() ?? "");
	const path = (args.pattern ?? DEFAULT_PATTERN).replace(
		":fileId",
		encodeURIComponent(args.fileId),
	);
	const hasSeal =
		args.sealIdPrefix !== undefined && args.sealNonce !== undefined;
	const seal = hasSeal
		? `?p=${bytesToHex(args.sealIdPrefix as Uint8Array)}&n=${bytesToHex(
				args.sealNonce as Uint8Array,
			)}`
		: "";
	return `${base}${path}${seal}`;
}
