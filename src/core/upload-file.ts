import {
	addEncryptedEntry,
	addEncryptedEntryFromBytes,
	addEntry,
	addEntryFromBytes,
	buildPublisherSealId,
	isWalrusFlowCapable,
	type UploadBlobOptions,
} from "@arcadiasystems/morse-sdk";
import type {
	UploadFileArgs,
	UploadFileDeps,
	UploadFileResult,
} from "../types.js";

// Seal nonce length; the Move layer requires at least one byte, 16 is typical.
const SEAL_NONCE_BYTES = 16;

/**
 * Upload a file to Walrus, optionally publishing it as a Morse entry and
 * optionally encrypting it with Seal.
 *
 * Mode is chosen by `args.target` and `args.encrypt`:
 * - No target: a plain Walrus blob (simple mode). Returns `{ mode: "blob" }`.
 *   Encryption is not available here (it needs a publication).
 * - Target, flow-capable adapter (`DefaultWalrusWriteAdapter`): one combined
 *   upload + add via `addEntryFromBytes` / `addEncryptedEntryFromBytes`.
 * - Target, non-flow-capable adapter (`HttpPublisherWriteAdapter`): a two-step
 *   upload then `addEntry` / `addEncryptedEntry` (encryption runs client-side
 *   first via `seal.encrypt`).
 *
 * @throws {Error} when encryption is requested without a target or seal adapter,
 *   or when a target is given without a wallet adapter.
 * @throws {MorseError} subclasses from the SDK on upload or publish failure.
 */
export async function uploadFile(
	deps: UploadFileDeps,
	args: UploadFileArgs,
): Promise<UploadFileResult> {
	const deletable = args.deletable ?? true;
	const upload: UploadBlobOptions = {
		epochs: args.epochs,
		deletable,
		...(args.signal === undefined ? {} : { signal: args.signal }),
	};

	// Simple mode: no publication target, just push bytes to Walrus.
	if (args.target === undefined) {
		if (args.encrypt === true) {
			throw new Error(
				"uploadFile: encryption requires a target (publication); set a target or disable encrypt.",
			);
		}
		args.onProgress?.({ phase: "uploading" });
		const result = await deps.walrus.uploadBlob(args.bytes, upload);
		args.onProgress?.({ phase: "complete" });
		return {
			mode: "blob",
			blobId: result.blobId,
			blobObjectId: result.blobObjectId,
		};
	}

	// Morse-entry mode needs a wallet to sign the on-chain add_entry.
	const { adapter } = deps;
	if (adapter === undefined) {
		throw new Error(
			"uploadFile: a wallet adapter is required to publish a Morse entry (a target was provided).",
		);
	}
	const { target } = args;
	const walrus = deps.walrus;

	if (args.encrypt === true) {
		if (deps.seal === undefined) {
			throw new Error(
				"uploadFile: encryption requires a seal adapter on the deps.",
			);
		}
		const seal = deps.seal;
		const sealId = buildPublisherSealId(
			target.publicationId,
			crypto.getRandomValues(new Uint8Array(SEAL_NONCE_BYTES)),
		);

		// Flow-capable: encrypt + upload + add in the combined SDK helper.
		if (isWalrusFlowCapable(walrus)) {
			const result = await addEncryptedEntryFromBytes(adapter, deps.config, {
				walrus,
				seal,
				publicationId: target.publicationId,
				publisherCapId: target.publisherCapId,
				collectionName: target.collectionName,
				name: args.name,
				plaintext: args.bytes,
				contentType: args.contentType,
				sealId,
				upload,
				...(args.onProgress === undefined
					? {}
					: { onProgress: args.onProgress }),
				...(args.signal === undefined ? {} : { signal: args.signal }),
			});
			return {
				mode: "entry",
				blobId: result.blobId,
				blobObjectId: result.blobObjectId,
				entryId: result.entryId,
				revisionId: result.revisionId,
				digest: result.digest,
				gasUsedMist: result.gasUsedMist,
				encrypted: true,
				sealId,
			};
		}

		// Publisher: encrypt client-side, upload the ciphertext, then add_entry.
		args.onProgress?.({ phase: "encrypting" });
		const { ciphertext } = await seal.encrypt(args.bytes, { sealId });
		args.onProgress?.({ phase: "uploading" });
		const uploaded = await walrus.uploadBlob(ciphertext, upload);
		args.onProgress?.({ phase: "submitting" });
		const added = await addEncryptedEntry(adapter, deps.config, {
			publicationId: target.publicationId,
			publisherCapId: target.publisherCapId,
			collectionName: target.collectionName,
			name: args.name,
			blobObjectId: uploaded.blobObjectId,
			contentType: args.contentType,
			sealId,
			...(args.signal === undefined ? {} : { signal: args.signal }),
		});
		args.onProgress?.({ phase: "complete" });
		return {
			mode: "entry",
			blobId: uploaded.blobId,
			blobObjectId: uploaded.blobObjectId,
			entryId: added.entryId,
			revisionId: added.revisionId,
			digest: added.digest,
			gasUsedMist: added.gasUsedMist,
			encrypted: true,
			sealId,
		};
	}

	// Plain entry, flow-capable: combined certify_blob + add_entry in one popup.
	if (isWalrusFlowCapable(walrus)) {
		const result = await addEntryFromBytes(adapter, deps.config, {
			walrus,
			publicationId: target.publicationId,
			publisherCapId: target.publisherCapId,
			collectionName: target.collectionName,
			name: args.name,
			bytes: args.bytes,
			contentType: args.contentType,
			upload,
			...(args.onProgress === undefined ? {} : { onProgress: args.onProgress }),
			...(args.signal === undefined ? {} : { signal: args.signal }),
		});
		return {
			mode: "entry",
			blobId: result.blobId,
			blobObjectId: result.blobObjectId,
			entryId: result.entryId,
			revisionId: result.revisionId,
			digest: result.digest,
			gasUsedMist: result.gasUsedMist,
			encrypted: false,
			sealId: null,
		};
	}

	// Plain entry, non-flow-capable (custom publisher): upload, then add_entry.
	args.onProgress?.({ phase: "uploading" });
	const uploaded = await walrus.uploadBlob(args.bytes, upload);
	args.onProgress?.({ phase: "submitting" });
	const added = await addEntry(adapter, deps.config, {
		publicationId: target.publicationId,
		publisherCapId: target.publisherCapId,
		collectionName: target.collectionName,
		name: args.name,
		blobObjectId: uploaded.blobObjectId,
		contentType: args.contentType,
		...(args.signal === undefined ? {} : { signal: args.signal }),
	});
	args.onProgress?.({ phase: "complete" });
	return {
		mode: "entry",
		blobId: uploaded.blobId,
		blobObjectId: uploaded.blobObjectId,
		entryId: added.entryId,
		revisionId: added.revisionId,
		digest: added.digest,
		gasUsedMist: added.gasUsedMist,
		encrypted: false,
		sealId: null,
	};
}
