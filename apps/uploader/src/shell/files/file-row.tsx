import type { ReactNode } from "react";
import { type BlobRow, shortenBlobId } from "@/blobs/blob-row";
import type { Phase } from "@/blobs/quilt-patch-store";
import { fileIcon } from "@/components/file-icon";
import { Icon } from "@/components/icon";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatShortDate } from "@/lib/format-date";
import { groupThousands } from "@/lib/group-thousands";
import { shortenAddress } from "@/lib/shorten-address";
import { ITEM_HEIGHT, type ListItem } from "./list-items";

interface FileRowProps {
	item: ListItem;
	id: string;
	/** 1-based row number in the whole grid, header included. */
	rowIndex: number;
	active: boolean;
	checked: boolean;
	/** The patch count of a quilt whose index can be read; `null` otherwise. */
	patchCount: Phase<number> | null;
	nowMs: number;
	onCheck: (objectId: string) => void;
	onMenu: (key: string, trigger: HTMLButtonElement) => void;
	onRetryPatches: (blobId: string) => void;
}

/**
 * One row of the Files list (design/v2/app.html): selection, icon, name and
 * a mono second line, size, upload date, storage left with its bar, and the
 * overflow menu. A quilt's files and read status lines sit one level in.
 */
export function FileRow({
	item,
	id,
	rowIndex,
	active,
	checked,
	patchCount,
	nowMs,
	onCheck,
	onMenu,
	onRetryPatches,
}: FileRowProps) {
	const common = {
		id,
		"aria-rowindex": rowIndex,
		"aria-selected": active,
		"data-key": item.key,
		style: { height: ITEM_HEIGHT[item.kind] },
	};
	switch (item.kind) {
		case "blob": {
			const { row } = item;
			const { label } = row;
			return (
				<tr
					{...common}
					className={rowClass(row, active)}
					aria-level={1}
					aria-posinset={item.position}
					aria-setsize={item.setSize}
					aria-expanded={item.expanded ?? undefined}
				>
					<td className="cbc">
						<input
							type="checkbox"
							className="cb"
							tabIndex={-1}
							checked={checked}
							aria-label={`Select ${label}`}
							onChange={() => onCheck(row.blob.objectId)}
						/>
					</td>
					<td className="icc">
						{item.expanded === null ? null : (
							<span className="tw" data-toggle="" aria-hidden="true">
								<Icon name="chevron" size={11} />
							</span>
						)}
						<BlobIcon row={row} />
					</td>
					<td className="nm">
						<BlobName row={row} />
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
					<td
						className="dt"
						title={`Registered in epoch ${row.blob.registeredEpoch}, about ${formatShortDate(row.registeredAtMs, nowMs)}`}
					>
						{formatShortDate(row.registeredAtMs, nowMs)}
					</td>
					<td className="life" title={lifeTitle(row, nowMs)}>
						<StorageLeft row={row} />
					</td>
					<td className="mc">
						<MenuButton
							label={label}
							onOpen={(trigger) => onMenu(item.key, trigger)}
						/>
					</td>
				</tr>
			);
		}
		case "patch":
			return (
				<tr
					{...common}
					className={active ? "tr child sel" : "tr child"}
					aria-level={2}
					aria-posinset={item.position}
					aria-setsize={item.setSize}
				>
					<td className="cbc" />
					<td className="icc">
						<span className="ic">
							<Icon name={fileIcon(item.identifier)} />
						</span>
					</td>
					<td className="nm" title={item.identifier}>
						{item.identifier}
					</td>
					<td className="sz" />
					<td className="dt" />
					<td className="life" />
					<td className="mc">
						<MenuButton
							label={item.identifier}
							onOpen={(trigger) => onMenu(item.key, trigger)}
						/>
					</td>
				</tr>
			);
		case "patches-loading":
			return (
				<tr
					{...common}
					className={active ? "tr child note sel" : "tr child note"}
					aria-level={2}
				>
					<td className="msg">Reading file names from storage nodes…</td>
				</tr>
			);
		case "patches-error":
			return (
				<tr
					{...common}
					className={active ? "tr child note sel" : "tr child note"}
					aria-level={2}
				>
					<td className="msg">
						<span className="problem-text">
							Could not read this quilt's files: {errorMessage(item.error)}
						</span>
						<button
							className="btn sm"
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

function rowClass(row: BlobRow, active: boolean): string {
	return ["tr", row.status.kind === "expired" ? "exp" : "", active ? "sel" : ""]
		.filter(Boolean)
		.join(" ");
}

export function MenuButton({
	label,
	onOpen,
}: {
	label: string;
	onOpen: (trigger: HTMLButtonElement) => void;
}) {
	return (
		<button
			type="button"
			className="more"
			tabIndex={-1}
			aria-label={`Actions for ${label}`}
			aria-haspopup="menu"
			onClick={(event) => onOpen(event.currentTarget)}
		>
			<Icon name="more" size={16} />
		</button>
	);
}

export function BlobIcon({ row }: { row: BlobRow }) {
	if (row.blob.isQuilt)
		return (
			<span className="ic quilt">
				<Icon name="quilt" />
			</span>
		);
	if (row.blob.isEncrypted)
		return (
			<span className="ic enc">
				<Icon name="lock" />
			</span>
		);
	return (
		<span className="ic">
			<Icon name={row.blob.name === null ? "file" : fileIcon(row.blob.name)} />
		</span>
	);
}

/** The name, or the short blob id when the blob has none. Quilts read as folders. */
export function BlobName({ row }: { row: BlobRow }) {
	const suffix = row.blob.isQuilt ? "/" : "";
	return (
		<span
			className={row.blob.name === null ? "bid" : undefined}
			title={row.blob.name ?? row.blob.blobId}
		>
			{row.label}
			{suffix}
		</span>
	);
}

/**
 * The second line, as the design writes it: `quilt · id · 31 files`,
 * `Seal · id`, `expired 3 Oct · record stays on Sui`. The blob id appears
 * here when the name line shows the name; an unnamed plain blob shows its
 * object id instead.
 */
export function BlobSubtitle({
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
			`expired ${formatShortDate(status.expiresAtMs, nowMs)}`,
			"record stays on Sui",
		);
	} else if (status.kind === "registered") {
		parts.push("registered, not certified");
	} else if (blob.isQuilt) {
		parts.push("quilt");
	} else if (blob.isEncrypted) {
		parts.push("Seal");
	}
	if (status.kind !== "expired") {
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
		const files = patchCount ? patchCountText(patchCount) : null;
		if (files) parts.push(files);
	}
	return parts.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
}

function patchCountText(count: Phase<number>): string {
	switch (count.status) {
		case "idle":
		case "loading":
			return "reading files";
		case "error":
			return "files unavailable";
		case "ready":
			return count.data === 1 ? "1 file" : `${count.data} files`;
	}
}

/** The share of paid storage left as a bar, with days left under it. */
export function StorageLeft({ row }: { row: BlobRow }) {
	const { status } = row;
	return (
		<>
			<span className={`bar ${lifeTone(row)}`} aria-hidden="true">
				<i
					style={{
						width: `${(status.kind === "expired" ? 0 : status.remaining * 100).toFixed(1)}%`,
					}}
				/>
			</span>
			<small>{lifeText(row)}</small>
		</>
	);
}

/** Red under a week left, amber under 30 days, violet for a blob still to finish. */
function lifeTone(row: BlobRow): string {
	const { kind, daysLeft } = row.status;
	if (kind === "expired") return "e";
	if (kind === "registered") return "v";
	if (daysLeft < 7) return "e";
	return kind === "expiring" ? "w" : "";
}

function lifeText(row: BlobRow): string {
	const { kind, daysLeft } = row.status;
	if (kind === "expired") return "expired";
	if (kind === "registered") return "finish";
	return daysLeft < 1 ? "< 1 d" : `${daysLeft} d`;
}

function lifeTitle(row: BlobRow, nowMs: number): string {
	const date = formatShortDate(row.status.expiresAtMs, nowMs);
	const epoch = row.blob.endEpoch;
	if (row.status.kind === "expired")
		return `Storage ended when epoch ${epoch} started, about ${date}`;
	if (row.status.kind === "registered")
		return `Never certified: finish it before epoch ${epoch} starts, about ${date}`;
	return `Storage ends when epoch ${epoch} starts, about ${date}`;
}
