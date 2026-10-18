/** One Walrus `Blob` object the wallet owns, decoded from chain. */
export interface BlobRecord {
	objectId: string;
	/** URL-safe base64 without padding, as aggregators and the Walrus CLI show it. */
	blobId: string;
	/** From the blob's attributes; `null` when none names it. */
	name: string | null;
	/** Unencoded size in bytes. */
	size: bigint;
	/** Encoded size in bytes: what storage is paid for. */
	encodedSize: bigint;
	deletable: boolean;
	registeredEpoch: number;
	/** `null` when the blob was registered but never certified. */
	certifiedEpoch: number | null;
	startEpoch: number;
	/** Storage is valid while the current epoch is below this. */
	endEpoch: number;
	isQuilt: boolean;
	isEncrypted: boolean;
}
