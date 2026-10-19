import { bytesEqual } from "../utils/bytes-equal.js";
import { ShareLinkSealError } from "./share-link-seal-error.js";
import type { SealMaterial } from "./types.js";

/**
 * Refuse a share link that cannot open the file it names, given the file's
 * Seal prefix as read from chain.
 *
 * A file with no on-chain prefix passes whatever the link carries. Files
 * encrypted before the prefix was stored on chain have none, and their links
 * still carry the Seal material, so a missing prefix does not prove a file is
 * public: the link's material decides, as it always has.
 *
 * A link whose prefix differs from the file's cannot decrypt it, so it is
 * refused here rather than costing the user a wallet signature for a Seal
 * session first. It is not repaired with the on-chain prefix: the nonce is not
 * on chain, so a link with one damaged field cannot be told apart from a link
 * to a different file.
 *
 * @throws {ShareLinkSealError} With reason `"missing"` when the file has a
 *   prefix and the link has no Seal material, or `"mismatch"` when the link's
 *   prefix is not the file's.
 */
export function assertShareLinkOpensFile(
	onChainPrefix: Uint8Array | null,
	seal: SealMaterial | null,
): void {
	if (onChainPrefix === null) {
		return;
	}
	if (seal === null) {
		throw new ShareLinkSealError("missing");
	}
	if (!bytesEqual(seal.sealIdPrefix, onChainPrefix)) {
		throw new ShareLinkSealError("mismatch");
	}
}
