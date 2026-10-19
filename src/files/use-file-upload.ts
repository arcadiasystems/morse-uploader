import {
	uploadEncryptedRecipientFileFromBytes,
	uploadRecipientFileFromBytes,
} from "@arcadiasystems/morse-sdk";
import { useCallback, useState } from "react";
import { buildShareLink } from "./build-share-link.js";
import { FileTooLargeError } from "./file-too-large-error.js";
import { resolveUploadSizeLimit } from "./resolve-upload-size-limit.js";
import type {
	CompletedFileUpload,
	FilePhase,
	FileUploadInput,
	FileUploadStatus,
	UseFileUploadResult,
} from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";
import { withCiphertextSizeLimit } from "./with-ciphertext-size-limit.js";

/** Shared message for the encrypted paths when no key servers exist. */
const SEAL_UNAVAILABLE =
	"No Seal key servers are configured, so encrypted files are unavailable. Testnet pins an open set; mainnet pins none, because every operator there is commercial. Pass `sealKeyServers` to MorseFilesProvider, starting from the SDK's MAINNET_SEAL_COMMITTEE with the apiKeyName and apiKey your operator issues.";

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/**
 * Upload one file as a RecipientFile. With `encrypt`, it encrypts under Seal
 * (only the recipients, plus the connected wallet, can decrypt); otherwise it
 * uploads a public file. Either way the recipient set is set at creation in two
 * wallet popups. Tracks the phase stepper and returns the fileId, the seal
 * material (encrypted only), and a share link.
 *
 * With an upload relay whose tip is capped, a file too large for the cap
 * fails with a {@link FileTooLargeError} naming the limit, before it is read.
 */
export function useFileUpload(): UseFileUploadResult {
	const { adapter, config, walrusWrite, uploadRelay, seal, network } =
		useMorseFilesContext();
	const [status, setStatus] = useState<FileUploadStatus>("idle");
	const [phase, setPhase] = useState<FilePhase | null>(null);
	const [data, setData] = useState<CompletedFileUpload | null>(null);
	const [error, setError] = useState<unknown>(null);

	const reset = useCallback(() => {
		setStatus("idle");
		setPhase(null);
		setData(null);
		setError(null);
	}, []);

	const upload = useCallback(
		async (input: FileUploadInput): Promise<CompletedFileUpload> => {
			setStatus("uploading");
			setPhase(null);
			setData(null);
			setError(null);
			try {
				// The SDK refuses a tip over the cap too, but only after encoding
				// the whole file, and as a transport error. Checking against the
				// relay's tip config first refuses the file before it is read.
				const sizeLimit = await resolveUploadSizeLimit(uploadRelay);
				if (sizeLimit !== null && input.file.size > sizeLimit.maxBytes) {
					throw new FileTooLargeError({
						sizeBytes: input.file.size,
						afterEncryption: false,
						limit: sizeLimit,
					});
				}
				const bytes = new Uint8Array(await input.file.arrayBuffer());
				const contentType = input.file.type || FALLBACK_CONTENT_TYPE;
				const recipients = input.recipients ?? [];
				const uploadOptions = {
					epochs: input.epochs,
					deletable: input.deletable ?? true,
				};
				const onProgress = (event: { phase: FilePhase }) =>
					setPhase(event.phase);

				let completed: CompletedFileUpload;
				if (input.encrypt === true) {
					if (seal === null) {
						throw new Error(SEAL_UNAVAILABLE);
					}
					const result = await uploadEncryptedRecipientFileFromBytes(
						adapter,
						config,
						{
							walrus:
								sizeLimit === null
									? walrusWrite
									: withCiphertextSizeLimit(walrusWrite, sizeLimit),
							seal,
							plaintext: bytes,
							recipients,
							name: input.file.name,
							contentType,
							upload: uploadOptions,
							onProgress,
						},
					);
					completed = {
						fileId: result.fileId,
						blobId: result.blobId,
						encrypted: true,
						sealIdPrefix: result.sealIdPrefix,
						sealNonce: result.sealNonce,
						shareLink: buildShareLink({
							fileId: result.fileId,
							network,
							sealIdPrefix: result.sealIdPrefix,
							sealNonce: result.sealNonce,
						}),
					};
				} else {
					const result = await uploadRecipientFileFromBytes(adapter, config, {
						walrus: walrusWrite,
						bytes,
						recipients,
						name: input.file.name,
						contentType,
						upload: uploadOptions,
						onProgress,
					});
					completed = {
						fileId: result.fileId,
						blobId: result.blobId,
						encrypted: false,
						sealIdPrefix: null,
						sealNonce: null,
						shareLink: buildShareLink({ fileId: result.fileId, network }),
					};
				}
				setData(completed);
				setStatus("success");
				return completed;
			} catch (err) {
				setError(err);
				setStatus("error");
				throw err;
			}
		},
		[adapter, config, walrusWrite, uploadRelay, seal, network],
	);

	return { status, phase, data, error, upload, reset };
}
