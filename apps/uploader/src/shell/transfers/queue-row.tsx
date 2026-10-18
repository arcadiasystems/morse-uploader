import { blobByObjectIdUrl } from "@/blobs/aggregator-urls";
import { shortenBlobId } from "@/blobs/blob-row";
import { fileIcon } from "@/components/file-icon";
import { Icon } from "@/components/icon";
import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import { shortenAddress } from "@/lib/shorten-address";
import { NETWORKS } from "@/network/networks";
import { MAX_ATTEMPTS } from "@/transfers/retry-policy";
import {
	itemProgress,
	stepStates,
	type TransferItem,
} from "@/transfers/transfer-state";

/** One item in the transfer queue: its steps, progress, blob id and what can be done next. */
export function QueueRow({
	item,
	onRetry,
	onDismiss,
}: {
	item: TransferItem;
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
}) {
	const { status } = item;
	const progress = itemProgress(item);
	const tone =
		status.kind === "done"
			? "done"
			: status.kind === "failed" || status.kind === "retrying"
				? "err"
				: "";
	return (
		<tr className={`q ${status.kind}`} data-transfer={item.id}>
			<td className="ico">
				<Icon
					name={
						item.kind === "quilt"
							? "quilt"
							: item.encrypted
								? "lock"
								: fileIcon(item.name)
					}
				/>
			</td>
			<td className="nm">
				<span className="label" title={item.name}>
					{item.kind === "quilt" ? `${item.name}/` : item.name}
					{item.kind === "quilt" ? (
						<span className="muted">
							{" "}
							→ quilt, {groupThousands(String(item.fileCount))}{" "}
							{item.fileCount === 1 ? "file" : "files"}
						</span>
					) : null}
				</span>
				<Detail item={item} />
			</td>
			<td className="steps">
				{stepStates(item).map(({ step, state }) => (
					<span key={step} className={state}>
						{state === "retrying" && status.kind === "retrying"
							? `retry ${status.attempt}/${MAX_ATTEMPTS}`
							: step}
					</span>
				))}
			</td>
			<td>
				<span
					className={`prog ${tone}`}
					role="progressbar"
					aria-label={`${item.name} progress`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(progress * 100)}
				>
					<i style={{ width: `${(progress * 100).toFixed(1)}%` }} />
				</span>
			</td>
			<td className="id">
				<BlobIdCell item={item} />
			</td>
			<td className="sp">
				<Speed item={item} onRetry={onRetry} onDismiss={onDismiss} />
			</td>
		</tr>
	);
}

/** A second line for an item that stopped: why, and the blob object Finish will certify. */
function Detail({ item }: { item: TransferItem }) {
	const { status } = item;
	if (status.kind === "done") return <Records item={item} />;
	if (status.kind !== "failed" && status.kind !== "retrying") return null;
	return (
		<small className="detail">
			{status.kind === "failed" ? `${capitalize(status.step)} failed: ` : ""}
			{status.error}
			{status.kind === "failed" && status.finishable && item.blobObjectId ? (
				<>
					{" "}
					Blob object{" "}
					<code title={item.blobObjectId}>
						{shortenAddress(item.blobObjectId)}
					</code>{" "}
					is on the storage nodes; Finish certifies it.
				</>
			) : null}
		</small>
	);
}

/** What a done item recorded on Morse: its RecipientFile and its entries. */
function Records({ item }: { item: TransferItem }) {
	if (item.records.length === 0) return null;
	return (
		<small className="records">
			{item.records.map((record) =>
				record.kind === "recipient-file" ? (
					<span key={record.digest}>
						Access policy{" "}
						<code title={record.fileId} data-recipient-file={record.fileId}>
							{shortenAddress(record.fileId)}
						</code>
					</span>
				) : (
					<span key={record.digest}>
						Entry{" "}
						{record.entryId === null ? null : (
							<code data-entry-id={record.entryId}>{record.entryId}</code>
						)}{" "}
						{record.name}
					</span>
				),
			)}
		</small>
	);
}

function BlobIdCell({ item }: { item: TransferItem }) {
	if (!item.blobId) return <span className="muted">pending</span>;
	const short = shortenBlobId(item.blobId);
	if (
		item.status.kind === "done" &&
		item.blobObjectId &&
		item.kind === "blob" &&
		!item.encrypted
	)
		return (
			<a
				href={blobByObjectIdUrl(
					NETWORKS[item.network].aggregatorUrl,
					item.blobObjectId,
				)}
				target="_blank"
				rel="noopener noreferrer"
				title={item.blobId}
			>
				{short}
			</a>
		);
	return <span title={item.blobId}>{short}</span>;
}

function Speed({
	item,
	onRetry,
	onDismiss,
}: {
	item: TransferItem;
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
}) {
	const { status } = item;
	switch (status.kind) {
		case "queued":
			return <>queued</>;
		case "awaiting-certify":
			return <>waiting for batch</>;
		case "running":
			if (status.step === "upload")
				return status.bytesPerSecond === null ? (
					<>starting</>
				) : (
					<>{formatBytes(BigInt(Math.round(status.bytesPerSecond)))}/s</>
				);
			if (status.step === "encode")
				return <>{item.encrypted ? "encrypting" : "encoding"}</>;
			return (
				<>
					tx {Math.min(item.signed + 1, item.transactions)} of{" "}
					{item.transactions}
				</>
			);
		case "retrying":
			return (
				<button
					className="link"
					type="button"
					aria-label={`Retry ${item.name} now`}
					onClick={() => onRetry(item.id)}
				>
					Retry now
				</button>
			);
		case "failed": {
			const action = status.needsClick
				? "Sign"
				: status.finishable
					? "Finish"
					: "Retry";
			return (
				<span className="acts">
					{status.retryable ? (
						<button
							className="link"
							type="button"
							aria-label={`${action} ${item.name}`}
							onClick={() => onRetry(item.id)}
						>
							{action}
						</button>
					) : null}
					<button
						className="link quiet"
						type="button"
						aria-label={`Dismiss ${item.name}`}
						onClick={() => onDismiss(item.id)}
					>
						Dismiss
					</button>
				</span>
			);
		}
		case "done": {
			const took =
				item.startedAtMs !== null && item.finishedAtMs !== null
					? item.finishedAtMs - item.startedAtMs
					: null;
			return <>done{took === null ? "" : ` · ${formatSeconds(took)}`}</>;
		}
	}
}

function formatSeconds(ms: number): string {
	const seconds = ms / 1000;
	return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
