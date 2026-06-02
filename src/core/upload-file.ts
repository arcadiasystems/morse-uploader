import {
	addEntry,
	addEntryFromBytes,
	isWalrusFlowCapable,
	type UploadBlobOptions,
} from "@arcadiasystems/morse-sdk";
import type {
	UploadFileArgs,
	UploadFileDeps,
	UploadFileResult,
} from "../types.js";

/**
 * Upload a file to Walrus, optionally publishing it as a Morse entry.
 *
 * Mode is chosen by `args.target`:
 * - No target: a plain Walrus blob (simple mode). Returns `{ mode: "blob" }`.
 * - Target + a flow-capable adapter (`DefaultWalrusWriteAdapter`): a combined
 *   upload + add_entry via `addEntryFromBytes` (2 wallet popups).
 * - Target + a non-flow-capable adapter (`HttpPublisherWriteAdapter`): a
 *   two-step `uploadBlob` then `addEntry`.
 *
 * Progress phases are forwarded for the direct path and synthesized for the
 * blob and publisher paths so a single `onProgress` handler covers all three.
 *
 * @throws {Error} when a target is given but no wallet adapter was provided.
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

	// Flow-capable adapters combine certify_blob + add_entry into one popup.
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
		};
	}

	// Non-flow-capable (custom publisher): upload, then add_entry separately.
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
	};
}
