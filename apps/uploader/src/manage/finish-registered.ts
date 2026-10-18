import { Transaction } from "@mysten/sui/transactions";
import type { BlobRecord } from "@/blobs/blob-record";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import { createWriteClient } from "@/transfers/create-write-client";
import type { WalletExecutor } from "@/transfers/wallet-executor";
import { readRelayTipConfig } from "@/upload/relay-tip-config";
import { relayTip, relayTipMax } from "@/upload/upload-cost";

/**
 * Finish for a Registered blob that has no saved upload in this browser
 * (PROTOCOL-NOTES section 6, "Finish after an epoch change"). Certify needs
 * a certificate from a quorum of storage nodes for the current epoch:
 *
 * 1. If the nodes already hold the slivers (the upload went through but
 *    certify never ran), `getStorageConfirmations` collects fresh
 *    signatures and one certify transaction finishes it. No file needed.
 * 2. If they do not, the bytes must be stored again. Given the original
 *    file, the app checks that it encodes to the same blob id, pays the
 *    relay a fresh tip (the relay reads one tip transaction per upload),
 *    uploads through it and certifies: two signatures.
 *
 * Certify must happen before the blob's storage ends (Move `blob.move:209`).
 */

type FinishBlob = Pick<
	BlobRecord,
	"blobId" | "objectId" | "deletable" | "size" | "encodedSize"
>;

/**
 * The certify transaction from the nodes' confirmations, built before the
 * wallet is asked, so a missing quorum stops here.
 * @throws {NotEnoughBlobConfirmationsError} When too few nodes hold the blob.
 */
export async function certifyFromNodes(
	client: NetworkClient,
	blob: FinishBlob,
	signal: AbortSignal,
): Promise<Transaction> {
	client.walrus.reset();
	const confirmations = await client.walrus.getStorageConfirmations({
		blobId: blob.blobId,
		deletable: blob.deletable,
		objectId: blob.objectId,
		signal,
	});
	const certificate = await client.walrus.certificateFromConfirmations({
		confirmations,
		blobId: blob.blobId,
		deletable: blob.deletable,
		blobObjectId: blob.objectId,
	});
	return client.walrus.certifyBlobTransaction({
		blobId: blob.blobId,
		blobObjectId: blob.objectId,
		certificate,
		deletable: blob.deletable,
	});
}

/** The chosen file is not the one the blob was registered for. */
export class NotTheSameFileError extends Error {
	constructor(detail: string) {
		super(`${detail} Choose the exact file you uploaded.`);
		this.name = "NotTheSameFileError";
	}
}

/**
 * A relay tip already paid for this blob's bytes. The relay accepts it for a
 * retried upload of the same bytes with the same nonce, so a retry after a
 * relay failure does not pay again.
 */
export interface PaidTip {
	blobId: string;
	nonce: Uint8Array;
	txDigest: string;
}

export interface UploadAgainInput {
	network: NetworkConfig;
	client: NetworkClient;
	executor: WalletExecutor;
	blob: FinishBlob;
	bytes: Uint8Array;
	/** A tip an earlier attempt paid for this blob, if any. */
	paidTip: PaidTip | null;
	signal: AbortSignal;
	/** Called after each step, so the inspector can show progress and keep the tip. */
	onStep: (
		step: { kind: "tip-paid"; tip: PaidTip } | { kind: "uploaded" },
	) => void;
}

/**
 * Stores the original file's bytes again for a registered blob and returns
 * the certify transaction for the wallet to sign.
 * @throws {NotTheSameFileError} When the file is not the one registered.
 */
export async function uploadAgain({
	network,
	client,
	executor,
	blob,
	bytes,
	paidTip,
	signal,
	onStep,
}: UploadAgainInput): Promise<Transaction> {
	if (BigInt(bytes.length) !== blob.size)
		throw new NotTheSameFileError(
			`That file is ${bytes.length} bytes; the registered blob is ${blob.size}.`,
		);
	const tipConfig = await readRelayTipConfig(network.uploadRelayUrl, signal);
	const writer = createWriteClient({
		network: network.id,
		tipMaxMist:
			tipConfig === null
				? null
				: relayTipMax(relayTip(tipConfig, blob.encodedSize)),
	});
	const reuse = paidTip?.blobId === blob.blobId ? paidTip : null;
	const metadata = await writer.computeBlobMetadata({
		bytes,
		...(reuse ? { nonce: reuse.nonce } : {}),
	});
	if (metadata.blobId !== blob.blobId)
		throw new NotTheSameFileError(
			`That file encodes to blob id ${metadata.blobId}, not ${blob.blobId}.`,
		);

	// A relay that asks no tip reads no tip transaction, so none is signed.
	let txDigest = reuse?.txDigest ?? "";
	if (tipConfig !== null && reuse === null) {
		const tip = new Transaction();
		tip.add(
			writer.sendUploadRelayTip({
				size: bytes.length,
				blobDigest: metadata.blobDigest,
				nonce: metadata.nonce,
			}),
		);
		signal.throwIfAborted();
		txDigest = (await executor.execute(tip, signal)).digest;
		onStep({
			kind: "tip-paid",
			tip: { blobId: blob.blobId, nonce: metadata.nonce, txDigest },
		});
	}
	const { certificate } = await writer.writeBlobToUploadRelay({
		blobId: blob.blobId,
		blob: bytes,
		nonce: metadata.nonce,
		txDigest,
		blobObjectId: blob.objectId,
		deletable: blob.deletable,
		encodingType: metadata.metadata.encodingType,
		signal,
	});
	onStep({ kind: "uploaded" });
	return client.walrus.certifyBlobTransaction({
		blobId: blob.blobId,
		blobObjectId: blob.objectId,
		certificate,
		deletable: blob.deletable,
	});
}
