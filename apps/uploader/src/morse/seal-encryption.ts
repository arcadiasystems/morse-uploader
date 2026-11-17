import { toHex } from "@mysten/sui/utils";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import type { SealSettings } from "@/upload/upload-plan";
import { loadMorseSdk } from "./load-morse-sdk";

/** The recipient-file policy tag between the prefix and the nonce (morse-sdk `SealPolicyTag`). */
export const POLICY_TAG_BYTES = 1;

/**
 * How Morse Uploader seals a file on a network: under Morse's RecipientFile
 * policy (PROTOCOL-NOTES section 11), with the key servers morse-sdk pins
 * for it. The policy package is Morse's original package id, which Seal
 * binds into every ciphertext.
 */
export async function readSealSettings(
	network: NetworkId,
): Promise<SealSettings> {
	const sdk = await loadMorseSdk();
	const config = sdk.morseConfig({ network });
	return {
		policyPackageId: config.originalPackageId ?? config.packageId,
		envelope: {
			keyServers: config.sealKeyServers.length,
			identityBytes:
				sdk.RECOMMENDED_SEAL_PREFIX_BYTES +
				POLICY_TAG_BYTES +
				sdk.RECOMMENDED_SEAL_NONCE_BYTES,
		},
	};
}

export interface SealedFile {
	ciphertext: Uint8Array;
	/** Bound on chain by the RecipientFile; recipients' decrypt requests are checked against it. */
	sealIdPrefixHex: string;
}

/**
 * Encrypts a file in the browser for a RecipientFile: a fresh random prefix
 * and nonce form the identity `prefix || tag || nonce`, which the
 * ciphertext carries. Only the key servers' public keys are fetched; the
 * plaintext never leaves the browser.
 */
export async function sealFile(
	client: NetworkClient,
	network: NetworkId,
	plaintext: Uint8Array,
): Promise<SealedFile> {
	const sdk = await loadMorseSdk();
	const seal = sdk.DefaultSealAdapter.fromMorseConfig(
		sdk.morseConfig({ network }),
		{},
		client,
	);
	const prefix = sdk.randomSealPrefix();
	const sealId = sdk.buildRecipientFileSealId(prefix, sdk.randomSealNonce());
	const { ciphertext } = await seal.encrypt(plaintext, { sealId });
	return { ciphertext, sealIdPrefixHex: toHex(prefix) };
}
