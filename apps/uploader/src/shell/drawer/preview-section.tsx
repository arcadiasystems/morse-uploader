import { useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { downloadFromAggregator } from "@/lib/save-bytes";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";
import { type PreviewPlan, previewPlan } from "@/manage/preview-plan";

export interface PreviewSource {
	/** The aggregator URL that serves the file's bytes. */
	url: string;
	name: string;
	mediaType: string | null;
	/** `null` when the size is unknown before reading, as for a file in a quilt. */
	size: bigint | null;
}

/**
 * The design's preview box with the file itself, read through the
 * aggregator: an image, or the start of a text file. Download and Open in
 * aggregator use the same URL.
 */
export function PreviewSection({ source }: { source: PreviewSource }) {
	const plan = previewPlan(source.mediaType, source.size);
	return (
		<section className="sec" aria-label="Preview">
			<div className="thumb">
				<PreviewBody plan={plan} source={source} />
			</div>
			<PreviewActions source={source} />
		</section>
	);
}

/** Download, Copy link and Open in aggregator, as the design orders them. */
function PreviewActions({ source }: { source: PreviewSource }) {
	const [download, setDownload] = useState<
		{ kind: "idle" } | { kind: "saving" } | { kind: "failed"; message: string }
	>({ kind: "idle" });
	const { state: copyState, copy } = useClipboardCopy();

	async function onDownload() {
		setDownload({ kind: "saving" });
		try {
			await downloadFromAggregator(source.url, source.name, source.mediaType);
			setDownload({ kind: "idle" });
		} catch (error) {
			setDownload({ kind: "failed", message: errorMessage(error) });
		}
	}

	return (
		<>
			<div className="acts">
				<button
					className="btn btn-ink xs"
					type="button"
					disabled={download.kind === "saving"}
					onClick={onDownload}
				>
					{download.kind === "saving" ? "Downloading…" : "Download"}
				</button>
				<button
					className="btn btn-soft xs"
					type="button"
					onClick={() => copy(source.url)}
				>
					{copyState === "copied" ? "Link copied" : "Copy link"}
				</button>
				<a
					className="btn btn-soft xs"
					href={source.url}
					target="_blank"
					rel="noopener noreferrer"
				>
					Open in aggregator
				</a>
			</div>
			{download.kind === "failed" ? (
				<p className="note warn" role="alert">
					Download failed: {download.message}
				</p>
			) : null}
			{copyState === "failed" ? (
				<p className="note" role="status">
					The browser blocked the clipboard. Copy the link from Share below.
				</p>
			) : (
				<span className="sr-only" role="status">
					{copyState === "copied" ? "Link copied" : ""}
				</span>
			)}
		</>
	);
}

function PreviewBody({
	plan,
	source,
}: {
	plan: PreviewPlan;
	source: PreviewSource;
}) {
	switch (plan.kind) {
		case "image":
			return <ImagePreview key={source.url} source={source} />;
		case "text":
			return (
				<TextPreview
					key={source.url}
					url={source.url}
					readBytes={plan.readBytes}
					size={source.size}
				/>
			);
		case "too-large":
			return (
				<span className="msg">
					Images over {formatBytes(plan.limitBytes)} are not previewed here.
					Download opens the full file.
				</span>
			);
		case "none":
			return (
				<span className="msg">
					No preview for{" "}
					{plan.mediaType ? plan.mediaType : "files of an unknown type"}.
				</span>
			);
	}
}

function ImagePreview({ source }: { source: PreviewSource }) {
	const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
	if (state === "failed")
		return (
			<span className="msg">
				This file did not load as an image: the aggregator may not serve it yet,
				or its bytes are not a valid image.
			</span>
		);
	return (
		<>
			{state === "loading" ? (
				<span className="msg" role="status">
					Loading preview…
				</span>
			) : null}
			{/* biome-ignore lint/performance/noImgElement: a static export has no image optimizer, and the bytes come from the aggregator. */}
			<img
				src={source.url}
				alt={`Preview of ${source.name}`}
				hidden={state !== "ready"}
				onLoad={() => setState("ready")}
				onError={() => setState("failed")}
			/>
		</>
	);
}

interface TextRead {
	text: string;
	truncated: boolean;
}

/**
 * Reads the first bytes of a text file with a Range request; the
 * aggregator answers 206 with just those bytes.
 */
async function readTextStart(
	url: string,
	readBytes: number,
	signal: AbortSignal,
): Promise<TextRead> {
	const response = await fetch(url, {
		headers: { Range: `bytes=0-${Math.max(0, readBytes - 1)}` },
		signal,
	});
	if (!response.ok)
		throw new Error(`The aggregator answered ${response.status}.`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const total = totalFromContentRange(response.headers.get("content-range"));
	const shown = bytes.slice(0, readBytes);
	return {
		text: new TextDecoder("utf-8", { fatal: false }).decode(shown),
		truncated:
			(total !== null && total > shown.length) || bytes.length > readBytes,
	};
}

function totalFromContentRange(header: string | null): number | null {
	const total = header ? /\/(\d+)$/.exec(header)?.[1] : undefined;
	return total ? Number(total) : null;
}

function TextPreview({
	url,
	readBytes,
	size,
}: {
	url: string;
	readBytes: number;
	size: bigint | null;
}) {
	const { read } = useChainRead(`${url}:${readBytes}`, (signal) =>
		readTextStart(url, readBytes, signal),
	);
	return <TextBody read={read} readBytes={readBytes} size={size} />;
}

function TextBody({
	read,
	readBytes,
	size,
}: {
	read: ChainRead<TextRead>;
	readBytes: number;
	size: bigint | null;
}) {
	switch (read.status) {
		case "idle":
		case "loading":
			return (
				<span className="msg" role="status">
					Loading preview…
				</span>
			);
		case "error":
			return (
				<span className="msg">
					The aggregator did not serve this file. Try Open in aggregator.
				</span>
			);
		case "ready":
			return (
				<pre>
					{read.data.text}
					{read.data.truncated
						? `\n\n[First ${formatBytes(BigInt(readBytes))}${size === null ? "" : ` of ${formatBytes(size)}`}. Download for the rest.]`
						: ""}
				</pre>
			);
	}
}
