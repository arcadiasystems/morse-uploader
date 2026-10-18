import { useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { downloadFromAggregator } from "@/lib/save-bytes";

type Download =
	| { kind: "idle" }
	| { kind: "saving" }
	| { kind: "failed"; message: string };

/**
 * The inspector's Download: fetches the file from the aggregator and saves
 * it under its name, through a same-origin object URL (the `download`
 * attribute is ignored on the aggregator's cross-origin links). `url` is
 * `null` when there are no bytes to serve: storage ended or not certified.
 */
export function DownloadButton({
	url,
	name,
	mediaType,
}: {
	url: string | null;
	name: string;
	mediaType: string | null;
}) {
	const [download, setDownload] = useState<Download>({ kind: "idle" });

	async function save(from: string) {
		setDownload({ kind: "saving" });
		try {
			await downloadFromAggregator(from, name, mediaType);
			setDownload({ kind: "idle" });
		} catch (error) {
			setDownload({ kind: "failed", message: errorMessage(error) });
		}
	}

	return (
		<>
			<button
				className="btn sm solid"
				type="button"
				disabled={url === null || download.kind === "saving"}
				aria-busy={download.kind === "saving"}
				title={
					url === null
						? "Only a certified blob with storage left can be downloaded."
						: undefined
				}
				onClick={() => {
					if (url !== null) void save(url);
				}}
			>
				{download.kind === "saving" ? "Downloading…" : "Download"}
			</button>
			{download.kind === "failed" ? (
				<p className="note warn" role="alert">
					Download failed: {download.message}
				</p>
			) : null}
		</>
	);
}
