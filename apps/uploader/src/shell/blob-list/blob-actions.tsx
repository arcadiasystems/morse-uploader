import { blobByObjectIdUrl } from "@/blobs/aggregator-urls";
import type { BlobRow } from "@/blobs/blob-row";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";
import type { NetworkConfig } from "@/network/networks";
import type { ListItem } from "./list-items";

/** Actions that sign transactions or need the blob drawer, which come in later phases. */
const LATER_ACTIONS = [
	"Extend",
	"Share",
	"Verify",
	"Publish to Morse",
] as const;

/**
 * The Walrus pane's toolbar. Only read-only actions work on a selection:
 * Download through the aggregator and copying the blob id.
 */
export function BlobActions({
	selected,
	network,
}: {
	selected: ListItem | null;
	network: NetworkConfig;
}) {
	const row = selected?.kind === "blob" ? selected.row : null;
	return (
		<>
			{row && isDownloadable(row) ? (
				<a
					className="btn btn-ghost xs"
					href={blobByObjectIdUrl(network.aggregatorUrl, row.blob.objectId)}
					target="_blank"
					rel="noopener noreferrer"
				>
					Download
				</a>
			) : (
				<button className="btn btn-ghost xs" type="button" disabled>
					Download
				</button>
			)}
			<CopyBlobIdButton
				key={row?.blob.objectId ?? "none"}
				blobId={row?.blob.blobId ?? null}
			/>
			{LATER_ACTIONS.map((action) => (
				<button
					key={action}
					className="btn btn-ghost xs"
					type="button"
					disabled
				>
					{action}
				</button>
			))}
		</>
	);
}

/**
 * A blob whose bytes an aggregator can serve as the file: certified, still
 * paid for, not a quilt (its patches are read one by one) and not encrypted
 * (the bytes would be ciphertext).
 */
function isDownloadable(row: BlobRow): boolean {
	const live =
		row.status.kind === "certified" || row.status.kind === "expiring";
	return live && !row.blob.isQuilt && !row.blob.isEncrypted;
}

function CopyBlobIdButton({ blobId }: { blobId: string | null }) {
	const { state, copy } = useClipboardCopy();
	return (
		<>
			<button
				className="btn btn-ghost xs"
				type="button"
				disabled={blobId === null}
				onClick={() => {
					if (blobId !== null) copy(blobId);
				}}
				title={
					state === "failed"
						? "The browser blocked the clipboard. The full blob id shows when you point at the short one in the list."
						: undefined
				}
			>
				{state === "copied"
					? "Blob id copied"
					: state === "failed"
						? "Copy blocked"
						: "Copy blob id"}
			</button>
			<span className="sr-only" role="status">
				{state === "copied"
					? "Blob id copied"
					: state === "failed"
						? "The browser blocked the clipboard"
						: ""}
			</span>
		</>
	);
}
