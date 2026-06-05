import {
	uploadEncryptedRecipientFileFromBytes,
	uploadRecipientFileFromBytes,
} from "@arcadiasystems/morse-sdk";
import { useCallback, useState } from "react";
import { buildShareLink } from "./build-share-link.js";
import type {
	CompletedFileUpload,
	FilePhase,
	FileUploadInput,
	FileUploadStatus,
	UseFileUploadResult,
} from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/**
 * Upload one file as a RecipientFile. With `encrypt`, it encrypts under Seal
 * (only the recipients, plus the connected wallet, can decrypt); otherwise it
 * uploads a public file. Either way the recipient set is set at creation in two
 * wallet popups. Tracks the phase stepper and returns the fileId, the seal
 * material (encrypted only), and a share link.
 */
export function useFileUpload(): UseFileUploadResult {
	const { adapter, config, walrusWrite, seal } = useMorseFilesContext();
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
					const result = await uploadEncryptedRecipientFileFromBytes(
						adapter,
						config,
						{
							walrus: walrusWrite,
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
						shareLink: buildShareLink({ fileId: result.fileId }),
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
		[adapter, config, walrusWrite, seal],
	);

	return { status, phase, data, error, upload, reset };
}
