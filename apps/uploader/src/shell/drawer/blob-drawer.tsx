import type { KeyboardEvent } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { Icon, type IconName } from "@/components/icon";
import { formatBytes } from "@/lib/format-bytes";
import { formatShortDate } from "@/lib/format-date";
import { type DrawerTarget, targetRow } from "./drawer-target";

/**
 * The blob drawer (design/app-blob.html): the header and Close for a blob, a quilt, or one file in a quilt; its
 * sections arrive with the features that fill them.
 */
export function BlobDrawer({
	target,
	listed,
	onClose,
}: {
	target: DrawerTarget;
	listed: ListedBlobs;
	onClose: () => void;
}) {
	const row = targetRow(target);

	const blob: BlobRecord = row.blob;
	const { clock, nowMs } = listed;

	function onKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (event.key === "Escape") {
			event.stopPropagation();
			onClose();
		}
	}

	const patch =
		target.kind === "patch" ? { identifier: target.identifier } : null;
	const name = patch ? patch.identifier : row.label;
	const mediaType: string | null = null;
	const registeredAtMs =
		clock.epochStartMs +
		(blob.registeredEpoch - clock.epoch) * clock.epochDurationMs;

	return (
		<aside
			className="drawer"
			aria-label={`Details of ${name}`}
			onKeyDown={onKeyDown}
		>
			<div className="hd">
				<span className={blob.isEncrypted ? "ico enc" : "ico"}>
					<Icon name={headerIcon(blob, mediaType, patch !== null)} />
				</span>
				<div>
					<h3>{name}</h3>
					<small>
						{patch
							? `file in quilt ${row.label}${mediaType ? ` · ${mediaType}` : ""}`
							: `${blob.isEncrypted ? "Seal-encrypted" : (mediaType ?? (blob.isQuilt ? "quilt" : "blob"))} · ${formatBytes(blob.size)} · registered about ${formatShortDate(registeredAtMs, nowMs)}`}
					</small>
				</div>
				<button
					className="x"
					type="button"
					aria-label="Close details"
					onClick={onClose}
				>
					<Icon name="close" size={16} />
				</button>
			</div>
		</aside>
	);
}

function headerIcon(
	blob: Pick<BlobRecord, "isQuilt" | "isEncrypted">,
	mediaType: string | null,
	isPatch: boolean,
): IconName {
	if (blob.isEncrypted) return "lock";
	if (blob.isQuilt && !isPatch) return "quilt";
	return mediaType?.startsWith("image/") ? "image" : "file";
}
