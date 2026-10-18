import { useCurrentClient } from "@mysten/dapp-kit-react";
import type { KeyboardEvent } from "react";
import { blobByObjectIdUrl, quiltPatchUrl } from "@/blobs/aggregator-urls";
import { CONTENT_TYPE_ATTRIBUTE } from "@/blobs/blob-attributes";
import type { BlobRecord } from "@/blobs/blob-record";
import { blobStatus } from "@/blobs/blob-status";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { readQuiltPatchList } from "@/blobs/quilt-patch-list";
import { readLiveBlob } from "@/blobs/read-blob-object";
import { Icon, type IconName } from "@/components/icon";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatShortDate } from "@/lib/format-date";
import { useChainRead } from "@/lib/use-chain-read";
import { mediaTypeOf } from "@/manage/preview-plan";
import type { NetworkConfig } from "@/network/networks";
import { type DrawerTarget, targetRow } from "./drawer-target";
import { PreviewSection } from "./preview-section";
import { RecordSection } from "./record-section";

/**
 * The blob drawer (design/app-blob.html): preview and record for a blob, a quilt, or one file in a quilt. The
 * record is read live from chain when the drawer opens.
 */
export function BlobDrawer({
	target,
	network,
	listed,
	onClose,
}: {
	target: DrawerTarget;
	network: NetworkConfig;
	listed: ListedBlobs;
	onClose: () => void;
}) {
	const client = useCurrentClient();
	const row = targetRow(target);
	const objectId = row.blob.objectId;
	const { read: live, refresh: readAgain } = useChainRead(
		`${network.id}:live:${objectId}`,
		(signal) => readLiveBlob(client, objectId, signal),
	);
	const patchEntry = useChainRead(
		target.kind === "patch"
			? `${network.id}:patch:${row.blob.blobId}:${target.identifier}`
			: null,
		async () => {
			const entries = await readQuiltPatchList(
				network.aggregatorUrl,
				row.blob.blobId,
			);
			const identifier = target.kind === "patch" ? target.identifier : "";
			const entry = entries.find(
				(candidate) => candidate.identifier === identifier,
			);
			if (!entry)
				throw new Error(
					`The aggregator does not list ${identifier} in this quilt.`,
				);
			return entry;
		},
	).read;

	const gone = live.status === "ready" && live.data === null;
	const blob: BlobRecord =
		live.status === "ready" && live.data ? live.data.record : row.blob;
	const { clock, nowMs } = listed;
	const status = blobStatus(blob, clock, nowMs);
	const expired = status.kind === "expired";
	const certified = blob.certifiedEpoch !== null;
	const liveAndCertified = certified && !expired;

	function onKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (event.key === "Escape") {
			event.stopPropagation();
			onClose();
		}
	}

	const patch =
		target.kind === "patch"
			? {
					identifier: target.identifier,
					entry: patchEntry.status === "ready" ? patchEntry.data : null,
				}
			: null;
	const name = patch ? patch.identifier : row.label;
	const mediaType = patch
		? mediaTypeOf(
				patch.entry?.tags[CONTENT_TYPE_ATTRIBUTE] ?? null,
				patch.identifier,
			)
		: mediaTypeOf(blob.contentType, blob.name ?? "");
	const url = patch
		? patch.entry
			? quiltPatchUrl(network.aggregatorUrl, patch.entry.patchId)
			: null
		: blobByObjectIdUrl(network.aggregatorUrl, blob.objectId);
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

			{live.status === "error" ? (
				<section className="sec" aria-label="Record status">
					<p className="note warn" role="alert">
						Could not read this blob from chain: {errorMessage(live.error)} The
						drawer shows the list's copy, which may be behind.{" "}
						<button className="cp" type="button" onClick={readAgain}>
							Try again
						</button>
					</p>
				</section>
			) : null}
			{gone ? (
				<section className="sec">
					<p className="note">
						This blob no longer exists on chain: it was deleted or burned.
						Refresh the list to drop it.
					</p>
				</section>
			) : (
				<>
					{blob.isEncrypted && !patch ? (
						<section className="sec" aria-label="Preview">
							<div className="thumb">
								<span className="msg">
									An encrypted blob's bytes are ciphertext, so there is nothing
									to preview.
								</span>
							</div>
						</section>
					) : blob.isQuilt && !patch ? (
						<section className="sec" aria-label="Preview">
							<div className="thumb">
								<span className="msg">
									A quilt holds files. Open it in the list and select a file to
									preview, share or publish it.
								</span>
							</div>
						</section>
					) : !liveAndCertified ? (
						<section className="sec" aria-label="Preview">
							<div className="thumb">
								<span className="msg">
									Aggregators serve a blob's bytes only once it is certified and
									until its storage ends.
								</span>
							</div>
						</section>
					) : url && name ? (
						<PreviewSection
							source={{
								url,
								name,
								mediaType,
								size: patch ? null : blob.size,
							}}
						/>
					) : (
						<section className="sec" aria-label="Preview">
							<div className="thumb">
								<span className="msg" role="status">
									{patchEntry.status === "error"
										? "The aggregator could not list this quilt's files, so this file cannot be previewed yet."
										: "Reading the quilt's file list…"}
								</span>
							</div>
						</section>
					)}

					<RecordSection
						network={network}
						blob={blob}
						previousTransaction={
							live.status === "ready"
								? (live.data?.previousTransaction ?? null)
								: null
						}
						owner={
							live.status === "ready"
								? { kind: "known", address: live.data?.owner ?? null }
								: live.status === "error"
									? { kind: "unavailable" }
									: { kind: "reading" }
						}
						viewer={null}
						patch={
							patch
								? {
										identifier: patch.identifier,
										patchId: patch.entry?.patchId ?? null,
									}
								: null
						}
					/>
				</>
			)}
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
