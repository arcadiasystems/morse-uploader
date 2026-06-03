import { morseConfig } from "@arcadiasystems/morse-sdk";
import { Download, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";

// Public reads go through the CORS-friendly aggregator; no wallet needed.
const AGGREGATOR = morseConfig({ network: "testnet" }).walrusEndpoints.aggregator;

// Walrus stores raw bytes with no filename or MIME type, so recover the type
// from the file's magic bytes to preview and to name the download correctly.
function sniffType(bytes: Uint8Array): { mime: string; ext: string } {
	const [a, b, c, d] = bytes;
	if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) {
		return { mime: "image/png", ext: "png" };
	}
	if (a === 0xff && b === 0xd8 && c === 0xff) {
		return { mime: "image/jpeg", ext: "jpg" };
	}
	if (a === 0x47 && b === 0x49 && c === 0x46) {
		return { mime: "image/gif", ext: "gif" };
	}
	if (
		a === 0x52 &&
		b === 0x49 &&
		c === 0x46 &&
		d === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return { mime: "image/webp", ext: "webp" };
	}
	if (a === 0x25 && b === 0x50 && c === 0x44 && d === 0x46) {
		return { mime: "application/pdf", ext: "pdf" };
	}
	return { mime: "application/octet-stream", ext: "bin" };
}

type Loaded = { url: string; mime: string; ext: string };

/**
 * Single-file viewer for `/<blobId>`. Fetches the public blob, sniffs its type
 * (Walrus keeps no MIME), previews images, and downloads with the right
 * extension. Encrypted blobs (flagged with ?enc=1 for now) show an encrypted
 * state; the Seal decrypt-on-open flow lands once encryption is wired.
 */
export function FileView({ blobId }: { blobId: string }) {
	const encrypted =
		new URLSearchParams(window.location.search).get("enc") === "1";
	const rawUrl = `${AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`;
	const [status, setStatus] = useState<"loading" | "ready" | "error">(
		"loading",
	);
	const [loaded, setLoaded] = useState<Loaded | null>(null);

	useEffect(() => {
		if (encrypted) {
			return;
		}
		let url: string | null = null;
		let cancelled = false;
		(async () => {
			try {
				const response = await fetch(rawUrl);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				const bytes = new Uint8Array(await response.arrayBuffer());
				const { mime, ext } = sniffType(bytes);
				url = URL.createObjectURL(new Blob([bytes], { type: mime }));
				if (!cancelled) {
					setLoaded({ url, mime, ext });
					setStatus("ready");
				}
			} catch {
				if (!cancelled) {
					setStatus("error");
				}
			}
		})();
		return () => {
			cancelled = true;
			if (url !== null) {
				URL.revokeObjectURL(url);
			}
		};
	}, [rawUrl, encrypted]);

	return (
		<section className="card view">
			<code className="cid view-cid">{blobId}</code>

			{encrypted ? (
				<div className="view-state">
					<Lock size={28} className="muted" />
					<p className="dz-title">This file is encrypted</p>
					<p className="muted">
						Decryption (Seal) requires a wallet that has access. That flow is
						coming.
					</p>
				</div>
			) : (
				<div className="view-state">
					{status === "loading" ? (
						<span className="muted">
							<Loader2 size={16} className="spin" /> Loading...
						</span>
					) : null}
					{status === "error" ? (
						<p className="error">
							Could not fetch this blob. It may have expired or not propagated
							yet.
						</p>
					) : null}
					{status === "ready" && loaded !== null ? (
						<>
							{loaded.mime.startsWith("image/") ? (
								<img className="view-img" src={loaded.url} alt={blobId} />
							) : (
								<p className="muted">{loaded.mime}</p>
							)}
							<a
								className="primary"
								href={loaded.url}
								download={`${blobId}.${loaded.ext}`}
							>
								<Download size={16} />
								Download
							</a>
						</>
					) : null}
				</div>
			)}
		</section>
	);
}
