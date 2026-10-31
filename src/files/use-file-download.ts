import type { RecipientFileId } from "@arcadiasystems/morse-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { isPreviewableImage } from "../utils/is-previewable-image.js";
import { triggerDownload } from "../utils/trigger-download.js";
import { assertShareLinkOpensFile } from "./assert-share-link-opens-file.js";
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
 * fetches the bytes on demand. Fetching starts by reading the file's Seal
 * prefix from chain, the one reliable sign that a file is encrypted; it is
 * read only then, so a page that just shows the metadata pays no extra round
 * trip. With Seal material from the share link the bytes are decrypted (one
 * SessionKey signature); without it they are read straight from Walrus as a
 * public file. A file with an on-chain prefix whose link has no Seal material,
 * or material for another prefix, fails with a {@link ShareLinkSealError}
 * instead. Files encrypted before the prefix was stored on chain have none, so
 * for them the link still decides.
 *
 * @param fileId The on-chain RecipientFile id (from the share link).
 * @param seal The Seal material (prefix + nonce) from the share link; null when it has none.
 */
export function useFileDownload(
	fileId: RecipientFileId | null,
	seal: SealMaterial | null,
): UseFileDownloadResult {
	const { reader, walrusRead } = useMorseFilesContext();
	const { status: metaStatus, file } = useRecipientFile(fileId);
	const { decrypt } = useFileDecrypt();
	const [status, setStatus] = useState<FileDownloadStatus>("idle");
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [error, setError] = useState<unknown>(null);
	const urlRef = useRef<string | null>(null);
	const lifetimeRef = useRef<AbortController | null>(null);

	// Revoke the object URL when it is replaced or the component unmounts.
	useEffect(() => {
		if (objectUrl === null) {
			return;
		}
		return () => URL.revokeObjectURL(objectUrl);
	}, [objectUrl]);

	// Aborted on unmount (null until mounted), so a prefix read for a page that
	// is gone stops there instead of going on to read bytes or ask the wallet
	// to sign.
	useEffect(() => {
		const controller = new AbortController();
		lifetimeRef.current = controller;
		return () => controller.abort();
	}, []);

	const encrypted = seal !== null;
	const isImage = file === null ? false : isPreviewableImage(file.contentType);

	// Fetch the plaintext bytes and build an object URL. Shared by load/download.
	const fetchToUrl = useCallback(async (): Promise<string | null> => {
		if (file === null) {
			return null;
		}
		const signal = lifetimeRef.current?.signal;
		setStatus("loading");
		setError(null);
		try {
			const onChainPrefix = await reader.getRecipientFileSealPrefix(
				file.id,
				signal,
			);
			signal?.throwIfAborted();
			assertShareLinkOpensFile(onChainPrefix, seal);
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
			// Unmounted mid-fetch: there is no page left to report to.
			if (signal?.aborted === true) {
				return null;
			}
			setError(err);
			setStatus("error");
			return null;
		}
	}, [file, seal, reader, decrypt, walrusRead]);

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
