import { blobByObjectIdUrl } from "@/blobs/aggregator-urls";
import type { BlobRow } from "@/blobs/blob-row";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";
import type { NetworkConfig } from "@/network/networks";
import type { DrawerSection } from "../drawer/blob-drawer";
import type { ListItem } from "./list-items";

/** Toolbar actions that open the blob drawer at their section, as the design orders them. */
const DRAWER_ACTIONS: readonly { label: string; section: DrawerSection }[] = [
	{ label: "Extend", section: "storage" },
	{ label: "Share", section: "share" },
	{ label: "Verify", section: "verify" },
	{ label: "Publish to Morse", section: "publish" },
];

/**
 * The Walrus pane's toolbar: Download through the aggregator and copying
 * the blob id act at once; Extend, Share, Verify and Publish to Morse open
 * the blob drawer at their section.
 */
export function BlobActions({
	selected,
	network,
	onOpen,
}: {
	selected: ListItem | null;
	network: NetworkConfig;
	onOpen: (section: DrawerSection) => void;
}) {
	const row = selected?.kind === "blob" ? selected.row : null;
	return (
		<>
			{row && isDownloadable(row) ? (
				<a
					className="btn sm"
					href={blobByObjectIdUrl(network.aggregatorUrl, row.blob.objectId)}
					target="_blank"
					rel="noopener noreferrer"
				>
					Download
				</a>
			) : (
				<button className="btn sm" type="button" disabled>
					Download
				</button>
			)}
			<CopyBlobIdButton
				key={row?.blob.objectId ?? "none"}
				blobId={row?.blob.blobId ?? null}
			/>
			{DRAWER_ACTIONS.map((action) => (
				<button
					key={action.section}
					className="btn sm"
					type="button"
					disabled={selected === null}
					onClick={() => onOpen(action.section)}
				>
					{action.label}
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
				className="btn sm"
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
