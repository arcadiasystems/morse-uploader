import type { SessionKey } from "@mysten/seal";
import { fromHex } from "@mysten/sui/utils";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import type { WalletExecutor } from "@/transfers/wallet-executor";
import { loadMorseSdk } from "./load-morse-sdk";
import { createMorseWalletAdapter } from "./morse-wallet-adapter";

/**
 * Seal decryption for wallets a RecipientFile allows (PROTOCOL-NOTES
 * section 11), and adding recipients to one. Decryption asks the wallet for
 * one personal-message signature per session key; the key servers then
 * check, by dry-running `recipient_file::seal_approve`, that the signer is
 * one of the file's members.
 */

/** Session keys last this long; one signature covers every decrypt until then. */
const SESSION_TTL_MINUTES = 10;

export type SignPersonalMessage = (
	message: Uint8Array,
) => Promise<{ signature: string }>;

/** Session keys by network and address, reused until they expire. */
const sessions = new Map<string, SessionKey>();

/**
 * A session key for `address`, signed by the wallet when there is no live
 * one. It is scoped to Morse's original package, which Seal binds into
 * every ciphertext under the RecipientFile policy.
 */
export async function sessionKeyFor({
	client,
	network,
	address,
	signPersonalMessage,
}: {
	client: NetworkClient;
	network: NetworkId;
	address: string;
	signPersonalMessage: SignPersonalMessage;
}): Promise<SessionKey> {
	const key = `${network}:${address}`;
	const known = sessions.get(key);
	if (known && !known.isExpired()) return known;
	const [{ SessionKey }, sdk] = await Promise.all([
		import("@mysten/seal"),
		loadMorseSdk(),
	]);
	const config = sdk.morseConfig({ network });
	const session = await SessionKey.create({
		address,
		packageId: config.originalPackageId ?? config.packageId,
		ttlMin: SESSION_TTL_MINUTES,
		suiClient: client,
	});
	const { signature } = await signPersonalMessage(session.getPersonalMessage());
	await session.setPersonalMessageSignature(signature);
	sessions.set(key, session);
	return session;
}

/** The ciphertext was not made under this RecipientFile's Seal prefix. */
export class WrongPolicyError extends Error {
	constructor() {
		super(
			"This blob was encrypted under a different access policy than its RecipientFile, so it cannot be decrypted with it.",
		);
		this.name = "WrongPolicyError";
	}
}

/**
 * Decrypts a blob's ciphertext through its RecipientFile. The Seal identity
 * travels in the ciphertext as `prefix || tag || nonce`; the prefix must be
 * the one the RecipientFile binds on chain.
 * @throws {WrongPolicyError} When the prefixes differ.
 */
export async function decryptWithRecipientFile({
	client,
	network,
	fileId,
	ciphertext,
	sessionKey,
}: {
	client: NetworkClient;
	network: NetworkId;
	fileId: string;
	ciphertext: Uint8Array;
	sessionKey: SessionKey;
}): Promise<Uint8Array> {
	const [{ EncryptedObject }, sdk] = await Promise.all([
		import("@mysten/seal"),
		loadMorseSdk(),
	]);
	const config = sdk.morseConfig({ network });
	const id = sdk.toRecipientFileId(fileId);
	const prefix = await sdk.RpcRecipientFilesReader.fromConfig(client, {
		packageId: config.packageId,
	}).getRecipientFileSealPrefix(id);
	if (prefix === null)
		throw new Error(
			"This RecipientFile has no Seal prefix: the file it shares is not encrypted.",
		);
	const identity = fromHex(EncryptedObject.parse(ciphertext).id);
	const matches =
		identity.length > prefix.length &&
		prefix.every((byte, index) => identity[index] === byte);
	if (!matches) throw new WrongPolicyError();
	const seal = sdk.DefaultSealAdapter.fromMorseConfig(config, {}, client);
	return seal.decryptUnderRecipientFile(ciphertext, {
		sessionKey,
		sealId: sdk.buildRecipientFileSealId(
			prefix,
			identity.slice(prefix.length + 1),
		),
		fileId: id,
	});
}

/**
 * Adds a recipient to a RecipientFile the wallet owns: one transaction.
 * @returns The transaction digest.
 */
export async function addRecipient({
	executor,
	client,
	network,
	fileId,
	recipient,
}: {
	executor: WalletExecutor;
	client: NetworkClient;
	network: NetworkId;
	fileId: string;
	recipient: string;
}): Promise<string> {
	const sdk = await loadMorseSdk();
	const result = await sdk.addRecipient(
		createMorseWalletAdapter(sdk, executor, client),
		sdk.morseConfig({ network }),
		{
			fileId: sdk.toRecipientFileId(fileId),
			recipient: sdk.toSuiAddress(recipient),
		},
	);
	return result.digest;
}
