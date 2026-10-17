import { UserError } from "@mysten/seal";
import type { Signer } from "@mysten/sui/cryptography";
import { normalizeSuiAddress } from "@mysten/sui/utils";

/**
 * Refuse to build a Seal session for `address` with a signer for another
 * account.
 *
 * `@mysten/seal` up to 1.4 made this check inside `SessionKey.create`; 1.5
 * dropped it to allow address aliases. Without it a mismatch costs a wallet
 * popup and then fails at the key servers, and `useFileDecrypt` would by then
 * have cached the session for `address`, so every later decrypt reuses it and
 * fails the same way. Handles from `useMorseFiles` always agree, because the
 * SDK's `WalletStandardSigner` requires the account's key to derive to its
 * address; this keeps hand-built handles failing early, as they did before.
 *
 * @throws {UserError} When the signer's address is not `address`. Same class
 *   and leading message as the check Seal used to make.
 */
export function assertSignerMatchesAddress(
	signer: Signer,
	address: string,
): void {
	const signerAddress = normalizeSuiAddress(signer.toSuiAddress());
	const sessionAddress = normalizeSuiAddress(address);
	if (signerAddress !== sessionAddress) {
		throw new UserError(
			`Signer address does not match session key address: the signer is ${signerAddress}, the session is for ${sessionAddress}. Build the handles with useMorseFiles, or pass a signer for the same account.`,
		);
	}
}
