import type { SessionKey } from "@mysten/seal";
import { blobUrl } from "@/blobs/aggregator-urls";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig, NetworkId } from "@/network/networks";
import type { WalletExecutor } from "@/transfers/wallet-executor";
import { loadMorseSdk } from "./load-morse-sdk";
import { createMorseWalletAdapter } from "./morse-wallet-adapter";
import { type OpenedBlob, openBlob } from "./seal-access";

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
async function sessionKeyFor({
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

/** Where opening a blob has got to, for the inspector to say. */
export type OpenStep = "checking" | "signing" | "decrypting";

/**
 * Opens a blob through its RecipientFile by the rule in `seal-access`: the
 * file's Seal prefix and the blob's bytes are read first, and the wallet
 * signs a session key only for ciphertext under that prefix. A file with no
 * prefix whose bytes are not Seal ciphertext comes back as it is, unsigned.
 * @throws {SealAccessError} When the rule refuses the blob.
 */
export async function openWithRecipientFile({
	client,
	network,
	blobId,
	fileId,
	address,
	signPersonalMessage,
	onStep,
}: {
	client: NetworkClient;
	network: NetworkConfig;
	blobId: string;
	fileId: string;
	address: string;
	signPersonalMessage: SignPersonalMessage;
	onStep: (step: OpenStep) => void;
}): Promise<OpenedBlob> {
	onStep("checking");
	const sdk = await loadMorseSdk();
	const config = sdk.morseConfig({ network: network.id });
	const id = sdk.toRecipientFileId(fileId);
	return openBlob({
		readPrefix: () =>
			sdk.RpcRecipientFilesReader.fromConfig(client, {
				packageId: config.packageId,
			}).getRecipientFileSealPrefix(id),
		readBytes: () => readBlobBytes(network.aggregatorUrl, blobId),
		signAndDecrypt: async (ciphertext, sealId) => {
			onStep("signing");
			const sessionKey = await sessionKeyFor({
				client,
				network: network.id,
				address,
				signPersonalMessage,
			});
			onStep("decrypting");
			return sdk.DefaultSealAdapter.fromMorseConfig(
				config,
				{},
				client,
			).decryptUnderRecipientFile(ciphertext, {
				sessionKey,
				sealId,
				fileId: id,
			});
		},
	});
}

/**
 * A blob's bytes as the aggregator serves them.
 * @throws {Error} When the aggregator does not serve them.
 */
async function readBlobBytes(
	aggregatorUrl: string,
	blobId: string,
): Promise<Uint8Array> {
	const response = await fetch(blobUrl(aggregatorUrl, blobId));
	if (!response.ok)
		throw new Error(`The aggregator answered ${response.status}.`);
	return new Uint8Array(await response.arrayBuffer());
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
