import { formatUserMessage } from "@arcadiasystems/morse-sdk";
import { type ReactElement, useMemo } from "react";
import type { MorseFileDownloaderProps, SealMaterial } from "../files/types.js";
import { useFileDownload } from "../files/use-file-download.js";
import { formatBytes } from "../utils/format-bytes.js";

/**
 * Drop-in single-file viewer/downloader for a share link. Loads the on-chain
 * metadata, then downloads (public read) or decrypts (recipient) the bytes with
 * the correct filename and MIME type. A RecipientFile has no on-chain encrypted
 * flag, so encryption is inferred from Seal material in the share link. Logic
 * lives in {@link useFileDownload}.
 */
export function MorseFileDownloader(
	props: MorseFileDownloaderProps,
): ReactElement {
	const { fileId, sealIdPrefix, sealNonce, className } = props;
	const seal = useMemo<SealMaterial | null>(() => {
		if (sealIdPrefix === undefined || sealIdPrefix === null) {
			return null;
		}
		if (sealNonce === undefined || sealNonce === null) {
			return null;
		}
		return { sealIdPrefix, sealNonce };
	}, [sealIdPrefix, sealNonce]);

	const dl = useFileDownload(fileId, seal);
	const { file } = dl;

	if (dl.metaStatus === "loading" || dl.metaStatus === "idle") {
		return (
			<section className={`mu-view ${className ?? ""}`} data-mu="view">
				<span className="mu-muted">Loading file...</span>
			</section>
		);
	}

	if (dl.metaStatus === "error" || file === null) {
		return (
			<section className={`mu-view ${className ?? ""}`} data-mu="view">
				<p className="mu-error" role="alert">
					Could not load this file. The id may be wrong or the record may have
					been deleted.
				</p>
			</section>
		);
	}

	const bytesError = dl.error === null ? null : formatUserMessage(dl.error);

	return (
		<section className={`mu-view ${className ?? ""}`} data-mu="view">
			<header className="mu-view-head">
				<strong className="mu-view-name">{file.name}</strong>
				<span className="mu-muted">
					{file.contentType} · {formatBytes(file.size)}
					{dl.encrypted ? " · encrypted" : ""}
				</span>
			</header>

			<div className="mu-view-body">
				{dl.status === "ready" && dl.isImage && dl.objectUrl !== null ? (
					<img className="mu-view-img" src={dl.objectUrl} alt={file.name} />
				) : null}

				{dl.status === "ready" ? (
					<button type="button" className="mu-upload" onClick={() => dl.save()}>
						Save file
					</button>
				) : (
					<button
						type="button"
						className="mu-upload"
						disabled={dl.status === "loading"}
						onClick={() => {
							void (dl.isImage ? dl.load() : dl.download());
						}}
					>
						{dl.status === "loading"
							? dl.encrypted
								? "Decrypting..."
								: "Downloading..."
							: dl.encrypted
								? "Decrypt and open"
								: "Download"}
					</button>
				)}

				{bytesError !== null ? (
					<div className="mu-error" role="alert">
						<strong>{bytesError.title}</strong>
						<span>{bytesError.description}</span>
					</div>
				) : null}
			</div>
		</section>
	);
}
