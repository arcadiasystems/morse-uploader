import type { ShareLinkSealErrorReason } from "./types.js";

const MESSAGES: Readonly<Record<ShareLinkSealErrorReason, string>> = {
	missing:
		"This file is encrypted, and the link is missing the details needed to decrypt it. Ask the sender for the full link.",
	mismatch:
		"This file is encrypted, and the link's decryption details are for a different file. The link may have been damaged or mixed up with another one. Ask the sender for the full link.",
};

/**
 * The file is encrypted on chain, and the share link cannot open it: the link
 * has no Seal material, or its Seal prefix is not the file's. Raised by
 * {@link useFileDownload} before any bytes are read or the wallet is asked to
 * sign, so a damaged link never serves ciphertext as if it were the file.
 */
export class ShareLinkSealError extends Error {
	readonly reason: ShareLinkSealErrorReason;

	constructor(reason: ShareLinkSealErrorReason) {
		super(MESSAGES[reason]);
		this.name = "ShareLinkSealError";
		this.reason = reason;
	}
}
