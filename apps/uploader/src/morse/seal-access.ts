import type { SealId } from "@arcadiasystems/morse-sdk";
import { fromHex } from "@mysten/sui/utils";
import { loadMorseSdk, type MorseSdk } from "./load-morse-sdk";
import { POLICY_TAG_BYTES } from "./seal-encryption";

/**
 * Whether Morse Uploader can open a blob through its RecipientFile, by the
 * rule Morse's share links follow: a Seal prefix on the RecipientFile
 * (morse-sdk 0.9.0 `getRecipientFileSealPrefix`) means the file is
 * encrypted, and it opens only with Seal material under that prefix. The
 * app's aggregator links serve raw bytes, so its material is the Seal
 * identity inside the ciphertext, `prefix || tag || nonce`.
 *
 * - No prefix, bytes not Seal ciphertext: a public file, opened unsigned.
 * - No prefix, Seal ciphertext: refused as `"older-format"`. morse-sdk
 *   0.9.0 decrypts a RecipientFile's blob only under its prefix, and the
 *   approval aborts with `ESealPrefixMissing` for a file without one.
 * - Prefix, bytes not Seal ciphertext: refused as `"missing"`.
 * - Prefix, identity under another prefix or policy tag, or without a
 *   nonce: refused as `"mismatch"`.
 * - Prefix, identity under it: signed and decrypted.
 *
 * Every refusal comes before the wallet is asked to sign.
 */

/** Why Morse Uploader will not open a blob. */
export type SealAccessRefusal = "missing" | "mismatch" | "older-format";

const REFUSALS: Record<SealAccessRefusal, string> = {
	missing:
		"Its RecipientFile says this file is encrypted, but the blob holds no Seal ciphertext to decrypt.",
	mismatch:
		"This blob was encrypted under a different access policy than its RecipientFile, so it cannot be decrypted with it.",
	"older-format":
		"This file uses an older encryption format that Morse Uploader can't open yet.",
};

/** A blob Morse Uploader refuses to open, before anything is signed. */
export class SealAccessError extends Error {
	readonly reason: SealAccessRefusal;

	constructor(reason: SealAccessRefusal) {
		super(`${REFUSALS[reason]} Nothing was signed or saved.`);
		this.name = "SealAccessError";
		this.reason = reason;
	}
}

/** The reads and the decrypt behind opening a blob, which `openBlob` orders. */
export interface OpenBlobSteps {
	/** The RecipientFile's Seal prefix on chain, or `null` when it has none. */
	readPrefix: () => Promise<Uint8Array | null>;
	/** The blob's bytes as Walrus stores them. */
	readBytes: () => Promise<Uint8Array>;
	/** Signs a session key and decrypts; called only for ciphertext the rule allows. */
	signAndDecrypt: (
		ciphertext: Uint8Array,
		sealId: SealId,
	) => Promise<Uint8Array>;
}

/** An opened blob: the plaintext of an encrypted file, or a public file's bytes. */
export type OpenedBlob =
	| { kind: "decrypted"; bytes: Uint8Array }
	| { kind: "public"; bytes: Uint8Array };

/**
 * Reads the RecipientFile's Seal prefix and the blob's bytes, applies the
 * rule above, and only then calls `signAndDecrypt`.
 * @throws {SealAccessError} When the rule refuses the blob.
 */
export async function openBlob(steps: OpenBlobSteps): Promise<OpenedBlob> {
	const [prefix, bytes, sdk] = await Promise.all([
		steps.readPrefix(),
		steps.readBytes(),
		loadMorseSdk(),
	]);
	const identity = await sealIdentityOf(bytes);
	if (prefix === null) {
		if (identity !== null) throw new SealAccessError("older-format");
		return { kind: "public", bytes };
	}
	if (identity === null) throw new SealAccessError("missing");
	const nonce = nonceUnderPrefix(identity, prefix, sdk);
	if (nonce === null) throw new SealAccessError("mismatch");
	const sealId = sdk.buildRecipientFileSealId(prefix, nonce);
	return {
		kind: "decrypted",
		bytes: await steps.signAndDecrypt(bytes, sealId),
	};
}

/** The Seal identity the bytes carry, or `null` when they are not Seal ciphertext. */
async function sealIdentityOf(bytes: Uint8Array): Promise<Uint8Array | null> {
	const { EncryptedObject } = await import("@mysten/seal");
	try {
		return fromHex(EncryptedObject.parse(bytes).id);
	} catch {
		// Seal's own BCS layout does not fit them: they are a plain file.
		return null;
	}
}

/**
 * The nonce of a RecipientFile identity `prefix || tag || nonce`, or `null`
 * when the identity starts with another prefix, carries another policy tag
 * or has no nonce.
 */
function nonceUnderPrefix(
	identity: Uint8Array,
	prefix: Uint8Array,
	sdk: MorseSdk,
): Uint8Array | null {
	const nonceStart = prefix.length + POLICY_TAG_BYTES;
	if (identity.length <= nonceStart) return null;
	if (!prefix.every((byte, index) => identity[index] === byte)) return null;
	if (identity[prefix.length] !== sdk.SealPolicyTag.RecipientFile) return null;
	return identity.slice(nonceStart);
}
