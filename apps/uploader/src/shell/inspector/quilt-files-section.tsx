import { useState } from "react";
import { quiltPathUrl } from "@/blobs/aggregator-urls";
import type { QuiltPatchEntry } from "@/blobs/quilt-patch-list";
import { errorMessage } from "@/lib/error-message";
import type { ChainRead } from "@/lib/use-chain-read";

/** Files listed before "+ N more", as the design shows a quilt. */
const FIRST_FILES = 4;

/**
 * A quilt's files by path (design/v2/app.html): each file's identifier and
 * its address on the aggregator, `/v1/blobs/by-quilt-id/{quilt}/{path}`.
 * The list comes from the aggregator, which also gives the patch ids that
 * share links and Morse entries use.
 */
export function QuiltFilesSection({
	aggregatorUrl,
	quiltBlobId,
	files,
	onRetry,
}: {
	aggregatorUrl: string;
	quiltBlobId: string;
	files: ChainRead<readonly QuiltPatchEntry[]>;
	onRetry: () => void;
}) {
	const [showAll, setShowAll] = useState(false);
	return (
		<section className="sec" id="insp-files" aria-labelledby="insp-files-title">
			<h4 id="insp-files-title">Files · address by path</h4>
			{files.status === "idle" || files.status === "loading" ? (
				<p className="note" role="status">
					Reading the quilt's files from the aggregator…
				</p>
			) : files.status === "error" ? (
				<p className="note warn" role="alert">
					Could not list this quilt's files: {errorMessage(files.error)}{" "}
					<button className="cp" type="button" onClick={onRetry}>
						Try again
					</button>
				</p>
			) : (
				<FileList
					aggregatorUrl={aggregatorUrl}
					quiltBlobId={quiltBlobId}
					entries={files.data}
					showAll={showAll}
					onShowAll={() => setShowAll(true)}
				/>
			)}
		</section>
	);
}

function FileList({
	aggregatorUrl,
	quiltBlobId,
	entries,
	showAll,
	onShowAll,
}: {
	aggregatorUrl: string;
	quiltBlobId: string;
	entries: readonly QuiltPatchEntry[];
	showAll: boolean;
	onShowAll: () => void;
}) {
	const shown = showAll ? entries : entries.slice(0, FIRST_FILES);
	const more = entries.length - shown.length;
	return (
		<ul className="files" aria-label="Files in this quilt">
			{shown.map((entry) => (
				<li key={entry.patchId}>
					<span className="nm">{entry.identifier}</span>
					<a
						href={quiltPathUrl(aggregatorUrl, quiltBlobId, entry.identifier)}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={`Open ${entry.identifier} on the aggregator`}
					>
						/{entry.identifier}
					</a>
				</li>
			))}
			{more > 0 ? (
				<li>
					<button className="more-files" type="button" onClick={onShowAll}>
						+ {more} more
					</button>
				</li>
			) : null}
		</ul>
	);
}
