import type { ReactNode } from "react";
import { type BlobRow, shortenBlobId } from "@/blobs/blob-row";
import type { BlobStatus, BlobStatusKind } from "@/blobs/blob-status";
import type { Phase } from "@/blobs/quilt-patch-store";
import { Icon, type IconName } from "@/components/icon";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatDays, formatShortDate } from "@/lib/format-date";
import { groupThousands } from "@/lib/group-thousands";
import { shortenAddress } from "@/lib/shorten-address";
import { ITEM_HEIGHT, type ListItem } from "./list-items";

interface ListRowProps {
	item: ListItem;
	id: string;
	/** 1-based row number in the whole grid, header included. */
	rowIndex: number;
	selected: boolean;
	/** The patch count of a quilt whose index can be read; `null` otherwise. */
	patchCount: Phase<number> | null;
	nowMs: number;
	onRetryPatches: (blobId: string) => void;
}

/** One row of the blob list: a blob, a quilt patch, or a quilt's read status. */
export function ListRow({
	item,
	id,
	rowIndex,
	selected,
	patchCount,
	nowMs,
	onRetryPatches,
}: ListRowProps) {
	const common = {
		id,
		"aria-rowindex": rowIndex,
		"aria-selected": selected,
		"data-key": item.key,
		style: { height: ITEM_HEIGHT[item.kind] },
	};
	switch (item.kind) {
		case "blob": {
			const { row } = item;
			return (
				<tr
					{...common}
					className={rowClass(row.status.kind, selected)}
					aria-level={1}
					aria-posinset={item.position}
					aria-setsize={item.setSize}
					aria-expanded={item.expanded ?? undefined}
				>
					<td className="ico-cell">
						{item.expanded === null ? null : (
							<span className="tw" data-toggle="" aria-hidden="true">
								<Icon name="chevron" size={12} />
							</span>
						)}
						<BlobIcon row={row} />
					</td>
					<td className="nm">
						<BlobLabel row={row} />
						<small>
							<BlobSubtitle row={row} patchCount={patchCount} nowMs={nowMs} />
						</small>
					</td>
					<td
						className="sz"
						title={`${groupThousands(row.blob.size.toString())} bytes, ${formatBytes(row.blob.encodedSize)} encoded`}
					>
						{formatBytes(row.blob.size)}
					</td>
					<ExpiryCell
						status={row.status}
						endEpoch={row.blob.endEpoch}
						nowMs={nowMs}
					/>
					<td className="st">
						<StatusChip row={row} />
					</td>
				</tr>
			);
		}
		case "patch":
			return (
				<tr
					{...common}
					className={selected ? "row patch sel" : "row patch"}
					aria-level={2}
					aria-posinset={item.position}
					aria-setsize={item.setSize}
				>
					<td />
					<td className="nm" title={item.identifier}>
						<Icon name={fileIcon(item.identifier)} />
						<span>{item.identifier}</span>
					</td>
					<td />
					<td className="ex" />
					<td className="st" />
				</tr>
			);
		case "patches-loading":
			return (
				<tr
					{...common}
					className={selected ? "row patch note sel" : "row patch note"}
					aria-level={2}
				>
					<td />
					<td className="msg">Reading patch names from storage nodes…</td>
				</tr>
			);
		case "patches-error":
			return (
				<tr
					{...common}
					className={selected ? "row patch note sel" : "row patch note"}
					aria-level={2}
				>
					<td />
					<td className="msg">
						<span className="problem-text">
							Could not read this quilt's patches: {errorMessage(item.error)}
						</span>
						<button
							className="btn btn-soft xs"
							type="button"
							onClick={() => onRetryPatches(item.quilt.blob.blobId)}
						>
							Try again
						</button>
					</td>
				</tr>
			);
	}
}

function rowClass(kind: BlobStatusKind, selected: boolean): string {
	return ["row", kind, kind === "expired" ? "dep" : "", selected ? "sel" : ""]
		.filter(Boolean)
		.join(" ");
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|heic)$/i;

function fileIcon(name: string): IconName {
	return IMAGE_EXTENSION.test(name) ? "image" : "file";
}

function BlobIcon({ row }: { row: BlobRow }) {
	if (row.blob.isQuilt) {
		return (
			<span className="ico dir">
				<Icon name="quilt" />
			</span>
		);
	}
	if (row.blob.isEncrypted) {
		return (
			<span className="ico enc">
				<Icon name="lock" />
			</span>
		);
	}
	return (
		<span className="ico">
			<Icon name={row.blob.name === null ? "file" : fileIcon(row.blob.name)} />
		</span>
	);
}

/** The name, or the short blob id when the blob has none. Quilts read as folders. */
function BlobLabel({ row }: { row: BlobRow }) {
	const suffix = row.blob.isQuilt ? "/" : "";
	if (row.blob.name === null) {
		return (
			<span className="bid" title={row.blob.blobId}>
				{row.label}
				{suffix}
			</span>
		);
	}
	return (
		<span title={row.blob.name}>
			{row.blob.name}
			{suffix}
		</span>
	);
}

/**
 * The second line, as the design writes it: `quilt · id · 2 patches`,
 * `Seal · id`, `Expired on 3 Oct · record on Sui`. The blob id appears here
 * when the name line shows the name; an unnamed plain blob shows its object
 * id instead.
 */
function BlobSubtitle({
	row,
	patchCount,
	nowMs,
}: {
	row: BlobRow;
	patchCount: Phase<number> | null;
	nowMs: number;
}) {
	const { blob, status } = row;
	const parts: ReactNode[] = [];
	if (status.kind === "expired") {
		parts.push(
			`Expired on ${formatShortDate(status.expiresAtMs, nowMs)}`,
			"record on Sui",
		);
	} else if (blob.isQuilt) {
		parts.push("quilt");
	} else if (blob.isEncrypted) {
		parts.push("Seal");
	}
	if (blob.name !== null) {
		parts.push(
			<span key="bid" className="bid" title={blob.blobId}>
				{shortenBlobId(blob.blobId)}
			</span>,
		);
	} else if (parts.length === 0) {
		parts.push(
			<span key="oid" className="oid" title={blob.objectId}>
				{shortenAddress(blob.objectId)}
			</span>,
		);
	}
	const patches = patchCount ? patchCountText(patchCount) : null;
	if (patches && status.kind !== "expired") parts.push(patches);
	return parts.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
}

function patchCountText(count: Phase<number>): string {
	switch (count.status) {
		case "idle":
		case "loading":
			return "reading patches";
		case "error":
			return "patches unavailable";
		case "ready":
			return count.data === 1 ? "1 patch" : `${count.data} patches`;
	}
}

function ExpiryCell({
	status,
	endEpoch,
	nowMs,
}: {
	status: BlobStatus;
	endEpoch: number;
	nowMs: number;
}) {
	const date = formatShortDate(status.expiresAtMs, nowMs);
	const title =
		status.kind === "expired"
			? `Storage ended when epoch ${endEpoch} started, about ${date}`
			: `Storage ends when epoch ${endEpoch} starts, about ${date}`;
	return (
		<td className="ex" title={title}>
			<span>{date}</span>
			<span className="bar" aria-hidden="true">
				<i style={{ width: `${(status.remaining * 100).toFixed(1)}%` }} />
			</span>
		</td>
	);
}

const CHIPS: Readonly<
	Record<BlobStatusKind, { className: string; title: string }>
> = {
	certified: { className: "chip ok", title: "Certified" },
	encrypted: { className: "chip ink", title: "Encrypted with Seal" },
	expiring: { className: "chip warn", title: "Paid storage ends soon" },
	registered: {
		className: "chip ultra",
		title: "Registered but never certified: the bytes are not confirmed stored",
	},
	expired: {
		className: "chip soon",
		title:
			"Paid storage has ended. The Blob object stays in your wallet as its record on Sui",
	},
};

function StatusChip({ row }: { row: BlobRow }) {
	const { kind, daysLeft } = row.status;
	const chip = CHIPS[kind];
	const title =
		kind === "certified" && row.blob.certifiedEpoch !== null
			? `Certified in epoch ${row.blob.certifiedEpoch}`
			: chip.title;
	return (
		<span className={chip.className} title={title}>
			{statusText(kind, daysLeft)}
		</span>
	);
}

function statusText(kind: BlobStatusKind, daysLeft: number): string {
	switch (kind) {
		case "certified":
			return "Certified";
		case "encrypted":
			return "Encrypted";
		case "expiring":
			return formatDays(daysLeft);
		case "registered":
			return "Registered";
		case "expired":
			return "Expired";
	}
}
