import type { RecipientFileId } from "@arcadiasystems/morse-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { isPreviewableImage } from "../utils/is-previewable-image.js";
import { triggerDownload } from "../utils/trigger-download.js";
import type {
	FileDownloadStatus,
	SealMaterial,
	UseFileDownloadResult,
} from "./types.js";
import { useFileDecrypt } from "./use-file-decrypt.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";
import { useRecipientFile } from "./use-recipient-file.js";

/**
 * Drive the single-file download page. Loads the on-chain metadata, then
 * fetches the bytes on demand. A RecipientFile has no on-chain "encrypted"
 * flag, so the caller signals encryption by passing the Seal material from the
 * share link: when present, the bytes are decrypted (one SessionKey signature);
 * when null, they are read straight from Walrus as a public file.
 *
 * @param fileId The on-chain RecipientFile id (from the share link).
 * @param seal The Seal material (prefix + nonce) for encrypted files; null for public.
 */
export function useFileDownload(
	fileId: RecipientFileId | null,
	seal: SealMaterial | null,
): UseFileDownloadResult {
	const { walrusRead } = useMorseFilesContext();
	const { status: metaStatus, file } = useRecipientFile(fileId);
	const { decrypt } = useFileDecrypt();
	const [status, setStatus] = useState<FileDownloadStatus>("idle");
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [error, setError] = useState<unknown>(null);
	const urlRef = useRef<string | null>(null);

	// Revoke the object URL when it is replaced or the component unmounts.
	useEffect(() => {
		if (objectUrl === null) {
			return;
		}
		return () => URL.revokeObjectURL(objectUrl);
	}, [objectUrl]);

	const encrypted = seal !== null;
	const isImage = file === null ? false : isPreviewableImage(file.contentType);

	// Fetch the plaintext bytes and build an object URL. Shared by load/download.
	const fetchToUrl = useCallback(async (): Promise<string | null> => {
		if (file === null) {
			return null;
		}
		setStatus("loading");
		setError(null);
		try {
			let bytes: Uint8Array;
			if (seal !== null) {
				bytes = await decrypt({
					file,
					sealIdPrefix: seal.sealIdPrefix,
					sealNonce: seal.sealNonce,
				});
			} else {
				bytes = await walrusRead.readBlob(file.blobId);
			}
			const url = URL.createObjectURL(
				new Blob([bytes as BlobPart], { type: file.contentType }),
			);
			urlRef.current = url;
			setObjectUrl(url);
			setStatus("ready");
			return url;
		} catch (err) {
			setError(err);
			setStatus("error");
			return null;
		}
	}, [file, seal, decrypt, walrusRead]);

	const load = useCallback(async (): Promise<void> => {
		await fetchToUrl();
	}, [fetchToUrl]);

	const save = useCallback(() => {
		if (urlRef.current !== null && file !== null) {
			triggerDownload(urlRef.current, file.name);
		}
	}, [file]);

	const download = useCallback(async (): Promise<void> => {
		const url = urlRef.current ?? (await fetchToUrl());
		if (url !== null && file !== null) {
			triggerDownload(url, file.name);
		}
	}, [fetchToUrl, file]);

	return {
		metaStatus,
		file,
		status,
		objectUrl,
		encrypted,
		isImage,
		error,
		load,
		save,
		download,
	};
}
