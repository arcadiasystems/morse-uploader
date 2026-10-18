import { ulebLength } from "@/lib/uleb-length";

/**
 * The size of a Seal ciphertext, so the upload sheet can price an encrypted
 * file before it is encrypted. It is the BCS `EncryptedObject` of
 * `@mysten/seal` 1.5.0 (`bcs.mjs`) with the defaults the app uses:
 * Boneh-Franklin BLS12-381 key encapsulation and AES-256-GCM with empty
 * additional data. The e2e test compares it with the size stored on chain.
 */

const VERSION_BYTES = 1;
const ADDRESS_BYTES = 32;
const THRESHOLD_BYTES = 1;
/** Enum variant index of `encryptedShares` and of `ciphertext`. */
const VARIANT_BYTES = 1;
/** Boneh-Franklin: a 96-byte G2 nonce, then 32 bytes per share and 32 of randomness. */
const BF_NONCE_BYTES = 96;
const BF_SHARE_BYTES = 32;
const BF_RANDOMNESS_BYTES = 32;
/** Each service: a key server object id and a u8 weight index. */
const SERVICE_BYTES = ADDRESS_BYTES + 1;
/** The AES-GCM authentication tag appended to the encrypted bytes. */
const GCM_TAG_BYTES = 16;
/** `aad: Option<vector<u8>>` holding an empty vector: the Some tag and a zero length. */
const EMPTY_AAD_BYTES = 2;

export interface SealEnvelope {
	/** Key servers the data is encrypted to. */
	keyServers: number;
	/** Bytes of the Seal identity (`prefix || tag || nonce`). */
	identityBytes: number;
}

export function sealCiphertextSize(
	plaintextBytes: number,
	{ keyServers, identityBytes }: SealEnvelope,
): number {
	const services = ulebLength(keyServers) + keyServers * SERVICE_BYTES;
	const shares =
		VARIANT_BYTES +
		BF_NONCE_BYTES +
		ulebLength(keyServers) +
		keyServers * BF_SHARE_BYTES +
		BF_RANDOMNESS_BYTES;
	const encryptedBytes = plaintextBytes + GCM_TAG_BYTES;
	const ciphertext =
		VARIANT_BYTES +
		ulebLength(encryptedBytes) +
		encryptedBytes +
		EMPTY_AAD_BYTES;
	return (
		VERSION_BYTES +
		ADDRESS_BYTES +
		ulebLength(identityBytes) +
		identityBytes +
		services +
		THRESHOLD_BYTES +
		shares +
		ciphertext
	);
}
