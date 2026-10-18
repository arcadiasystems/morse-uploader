import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkId } from "@/network/networks";
import type { WalletExecutor } from "@/transfers/wallet-executor";
import type { PublishChoice } from "@/upload/publish-rules";
import { loadMorseSdk } from "./load-morse-sdk";
import { createMorseWalletAdapter } from "./morse-wallet-adapter";

export interface AttachInput {
	executor: WalletExecutor;
	client: NetworkClient;
	network: NetworkId;
	choice: PublishChoice;
	/** The entry's name: the blob's name, or the quilt file's identifier. */
	name: string;
	contentType: string;
	blobObjectId: string;
	/** A quilt file's patch id, URL-safe base64; `null` for a standalone blob. */
	patchId: string | null;
}

export interface AttachResult {
	entryId: number;
	digest: string;
}

/**
 * Attaches a blob the wallet already owns as a Morse entry: one transaction
 * through morse-sdk 0.9.0's `addEntry` (PROTOCOL-NOTES section 12). The Blob
 * is passed by reference and stays in the wallet; a quilt file goes into a
 * quilt collection by its patch id.
 */
export async function attachToMorse({
	executor,
	client,
	network,
	choice,
	name,
	contentType,
	blobObjectId,
	patchId,
}: AttachInput): Promise<AttachResult> {
	const sdk = await loadMorseSdk();
	const { entryId, digest } = await sdk.addEntry(
		createMorseWalletAdapter(sdk, executor, client),
		sdk.morseConfig({ network }),
		{
			publicationId: sdk.toPublicationId(choice.publicationId),
			publisherCapId: sdk.toPublisherCapId(choice.publisherCapId),
			collectionName: choice.collectionName,
			name,
			blobObjectId: sdk.toBlobObjectId(blobObjectId),
			contentType,
			...(patchId === null
				? {}
				: { quiltPatchId: sdk.quiltPatchIdFromString(patchId) }),
		},
	);
	return { entryId, digest };
}
