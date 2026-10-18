import { blobByObjectIdUrl } from "@/blobs/aggregator-urls";
import { shortenBlobId } from "@/blobs/blob-row";
import { fileIcon } from "@/components/file-icon";
import { Icon, type IconName } from "@/components/icon";
import { formatBytes } from "@/lib/format-bytes";
import { groupThousands } from "@/lib/group-thousands";
import { shortenAddress } from "@/lib/shorten-address";
import { explorerObjectUrl, explorerTxUrl } from "@/network/explorer-urls";
import { NETWORKS } from "@/network/networks";
import { MAX_ATTEMPTS } from "@/transfers/retry-policy";
import { itemProgress, type TransferItem } from "@/transfers/transfer-state";
import {
	type ItemAction,
	itemAction,
	stepSegments,
} from "@/transfers/transfer-view";

interface TransferRowProps {
	item: TransferItem;
	paused: boolean;
	nowMs: number;
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
}

/**
 * One transfer (design/v2/app-transfers.html): its name and blob id, five
 * segments for encode, register, upload, certify and record, where it
 * stands, and what can be done when it stopped: Retry now while a retry
 * counts down, Finish when certify failed after the upload, Retry or Sign
 * otherwise.
 */
export function TransferRow({
	item,
	paused,
	nowMs,
	onRetry,
	onDismiss,
}: TransferRowProps) {
	const { status } = item;
	const action = itemAction(item, nowMs);
	const segments = stepSegments(item);
	return (
		<li
			className={`tx ${status.kind}`}
			data-transfer={item.id}
			data-name={item.name}
		>
			<div className="l1">
				<span className="ic" aria-hidden="true">
					<Icon name={iconOf(item)} />
				</span>
				<span className="nm" title={item.name}>
					{item.kind === "quilt" ? `${item.name}/` : item.name}
					{item.kind === "quilt" ? (
						<span className="muted">
							{" "}
							→ quilt, {groupThousands(String(item.fileCount))}{" "}
							{item.fileCount === 1 ? "file" : "files"}
						</span>
					) : null}
				</span>
				<span className="id">
					<BlobId item={item} />
				</span>
			</div>
			<span
				className="steps"
				role="progressbar"
				aria-label={`${item.name} progress`}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(itemProgress(item) * 100)}
			>
				{segments.map((segment) => (
					<span key={segment.step} className={segment.state}>
						{segment.fill !== null ? (
							<i style={{ width: `${(segment.fill * 100).toFixed(1)}%` }} />
						) : null}
					</span>
				))}
			</span>
			<div className="l3">
				<Where item={item} action={action} segments={segments} />
				<Act
					item={item}
					action={action}
					paused={paused}
					onRetry={onRetry}
					onDismiss={onDismiss}
				/>
			</div>
			<Detail item={item} />
		</li>
	);
}

function iconOf(item: TransferItem): IconName {
	if (item.kind === "quilt") return "quilt";
	if (item.encrypted) return "lock";
	return fileIcon(item.name);
}

/** The left of the status line: the steps with the current one marked, or what went wrong. */
function Where({
	item,
	action,
	segments,
}: {
	item: TransferItem;
	action: ItemAction | null;
	segments: ReturnType<typeof stepSegments>;
}) {
	const { status } = item;
	if (status.kind === "retrying" && action?.kind === "retry-now")
		return (
			<span className="where err">
				{status.step} failed · retry {action.attempt} of {MAX_ATTEMPTS} in{" "}
				{action.seconds} s
			</span>
		);
	if (status.kind === "failed")
		return <span className="where err">{status.step} failed</span>;
	if (status.kind === "done") {
		const took =
			item.startedAtMs !== null && item.finishedAtMs !== null
				? ` · ${formatSeconds(item.finishedAtMs - item.startedAtMs)}`
				: "";
		return (
			<span className="where">
				{item.records.length > 0 ? "recorded" : "certified"}
				{took}
			</span>
		);
	}
	return (
		<span className="where names">
			{segments.map((segment, index) => (
				<span key={segment.step}>
					{index > 0 ? <span aria-hidden="true"> · </span> : null}
					{segment.state === "now" ? (
						<b>{segment.step}</b>
					) : (
						<span className={segment.state === "skipped" ? "skip" : undefined}>
							{segment.step}
						</span>
					)}
				</span>
			))}
		</span>
	);
}

/** The right of the status line: progress, the wallet step, or the action. */
function Act({
	item,
	action,
	paused,
	onRetry,
	onDismiss,
}: {
	item: TransferItem;
	action: ItemAction | null;
	paused: boolean;
	onRetry: (id: string) => void;
	onDismiss: (id: string) => void;
}) {
	const { status } = item;
	if (action) {
		if (action.kind === "retry-now")
			return (
				<button
					className="a"
					type="button"
					aria-label={`Retry ${item.name} now`}
					onClick={() => onRetry(item.id)}
				>
					Retry now
				</button>
			);
		const label =
			action.kind === "finish"
				? "Finish"
				: action.kind === "sign"
					? "Sign"
					: action.kind === "retry"
						? "Retry"
						: null;
		return (
			<span className="acts">
				{label ? (
					<button
						className="a"
						type="button"
						aria-label={`${label} ${item.name}`}
						onClick={() => onRetry(item.id)}
					>
						{label}
					</button>
				) : null}
				<button
					className="a quiet"
					type="button"
					aria-label={`Dismiss ${item.name}`}
					onClick={() => onDismiss(item.id)}
				>
					Dismiss
				</button>
			</span>
		);
	}
	switch (status.kind) {
		case "queued":
			return <span className="act">{paused ? "paused" : "queued"}</span>;
		case "awaiting-certify":
			return <span className="act">waiting for the batch</span>;
		case "running":
			if (status.step === "encode")
				return (
					<span className="act">
						{item.encrypted ? "encrypting" : "encoding"}
					</span>
				);
			if (status.step === "upload") {
				const share =
					item.uploadBytes > 0
						? Math.round(
								(100 * Math.min(status.sentBytes, item.uploadBytes)) /
									item.uploadBytes,
							)
						: 0;
				return (
					<span className="act">
						{share}% ·{" "}
						{status.bytesPerSecond === null
							? formatBytes(BigInt(item.uploadBytes))
							: `${formatBytes(BigInt(Math.round(status.bytesPerSecond)))}/s`}
					</span>
				);
			}
			return (
				<span className="act a">
					waiting for wallet · tx {Math.min(item.signed + 1, item.transactions)}{" "}
					of {item.transactions}
				</span>
			);
		case "done":
			return <DoneLink item={item} />;
		default:
			return null;
	}
}

/** Where a finished transfer can be seen: its last Morse record, or the blob. */
function DoneLink({ item }: { item: TransferItem }) {
	const network = NETWORKS[item.network];
	const record = item.records.at(-1);
	if (record)
		return (
			<a
				className="a"
				href={explorerTxUrl(network, record.digest)}
				target="_blank"
				rel="noopener noreferrer"
			>
				View record
			</a>
		);
	if (!item.blobObjectId) return null;
	const href =
		item.kind === "blob" && !item.encrypted
			? blobByObjectIdUrl(network.aggregatorUrl, item.blobObjectId)
			: explorerObjectUrl(network, item.blobObjectId);
	return (
		<a className="a" href={href} target="_blank" rel="noopener noreferrer">
			View blob
		</a>
	);
}

function BlobId({ item }: { item: TransferItem }) {
	if (!item.blobId) return <span className="muted">pending</span>;
	return <span title={item.blobId}>{shortenBlobId(item.blobId)}</span>;
}

/** Why an item stopped and what Finish certifies; for a done item, what it recorded on Morse. */
function Detail({ item }: { item: TransferItem }) {
	const { status } = item;
	if (status.kind === "done") {
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
	if (status.kind !== "failed" && status.kind !== "retrying") return null;
	return (
		<small className="detail">
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

function formatSeconds(ms: number): string {
	const seconds = ms / 1000;
	return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
}
