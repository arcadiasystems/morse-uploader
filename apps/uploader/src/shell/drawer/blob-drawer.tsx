import { useCurrentClient } from "@mysten/dapp-kit-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { blobByObjectIdUrl, quiltPatchUrl } from "@/blobs/aggregator-urls";
import { CONTENT_TYPE_ATTRIBUTE } from "@/blobs/blob-attributes";
import type { BlobRecord } from "@/blobs/blob-record";
import { blobStatus } from "@/blobs/blob-status";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { readQuiltPatchList } from "@/blobs/quilt-patch-list";
import { readLiveBlob } from "@/blobs/read-blob-object";
import { Icon, type IconName } from "@/components/icon";
import type { Balances } from "@/funds/types";
import { errorMessage } from "@/lib/error-message";
import { formatBytes } from "@/lib/format-bytes";
import { formatShortDate } from "@/lib/format-date";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import { deleteBlocker } from "@/manage/delete-rules";
import { mediaTypeOf } from "@/manage/preview-plan";
import { embedSnippet, shareLinks } from "@/manage/share";
import type { AutoExtend } from "@/manage/use-auto-extend";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { DeleteSection } from "./delete-section";
import { type DrawerTarget, targetRow } from "./drawer-target";
import { EncryptedSection } from "./encrypted-section";
import { FinishSection } from "./finish-section";
import { PreviewSection } from "./preview-section";
import { PublishSection, type PublishSubject } from "./publish-section";
import { RecordSection } from "./record-section";
import { ShareSection } from "./share-section";
import { StorageSection } from "./storage-section";
import { VerifySection } from "./verify-section";

/** Sections the Walrus pane's toolbar can open the drawer at. */
export type DrawerSection = "verify" | "storage" | "publish" | "share";

/** What the drawer needs from the shell: signing, balances, auto-extend and a way to re-read. */
export interface DrawerContext {
	actions: WalletActions | null;
	balances: ChainRead<Balances>;
	autoExtend: AutoExtend | null;
	/** Something changed on chain: the list and balances read again. */
	onChanged: () => void;
}

/**
 * The blob drawer (design/app-blob.html): preview, verification, record,
 * storage with extend and auto-extend, publish to Morse, share and delete,
 * for a blob, a quilt, or one file in a quilt. The record is read live from
 * chain when the drawer opens and after every change it makes.
 */
export function BlobDrawer({
	target,
	network,
	listed,
	context,
	focus,
	onClose,
}: {
	target: DrawerTarget;
	network: NetworkConfig;
	listed: ListedBlobs;
	context: DrawerContext;
	focus: { section: DrawerSection; request: number } | null;
	onClose: () => void;
}) {
	const client = useCurrentClient();
	const panel = useRef<HTMLElement>(null);
	const row = targetRow(target);
	const objectId = row.blob.objectId;
	// Kept here: Finish's own section goes once the blob reads as certified.
	const [certifiedBy, setCertifiedBy] = useState<string | null>(null);
	// Refreshed after each change, so the last record stays on screen meanwhile.
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

	useEffect(() => {
		if (focus === null) return;
		panel.current
			?.querySelector(`#drawer-${focus.section}`)
			?.scrollIntoView({ block: "start" });
	}, [focus]);

	const gone = live.status === "ready" && live.data === null;
	const blob: BlobRecord =
		live.status === "ready" && live.data ? live.data.record : row.blob;
	const { clock, nowMs } = listed;
	const status = blobStatus(blob, clock, nowMs);
	const expired = status.kind === "expired";
	const certified = blob.certifiedEpoch !== null;
	const liveAndCertified = certified && !expired;

	function changed() {
		readAgain();
		context.onChanged();
	}

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
			ref={panel}
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

			{certifiedBy ? (
				<section className="sec" aria-label="Finish">
					<p className="note ok" role="status">
						Certified. Storage nodes hold it and aggregators can serve it.{" "}
						<a
							href={explorerTxUrl(network, certifiedBy)}
							target="_blank"
							rel="noopener noreferrer"
						>
							View transaction
						</a>
					</p>
				</section>
			) : null}
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
					{!certified && !expired && !patch ? (
						<FinishSection
							network={network}
							blob={blob}
							expiresAtMs={status.expiresAtMs}
							nowMs={nowMs}
							actions={context.actions}
							onFinished={(digest) => {
								setCertifiedBy(digest);
								changed();
							}}
						/>
					) : blob.isEncrypted && !patch ? (
						<EncryptedSection
							network={network}
							blob={blob}
							readable={liveAndCertified}
							actions={context.actions}
						/>
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
									Its storage has ended, so aggregators may no longer serve its
									bytes.
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

					{certified || expired ? (
						<VerifySection
							key={blob.blobId}
							blob={blob}
							expired={expired}
							scope={patch ? "quilt-file" : "blob"}
						/>
					) : null}

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
						viewer={context.actions?.address ?? null}
						patch={
							patch
								? {
										identifier: patch.identifier,
										patchId: patch.entry?.patchId ?? null,
									}
								: null
						}
					/>

					<StorageSection
						network={network}
						blob={blob}
						status={status}
						clock={clock}
						nowMs={nowMs}
						actions={context.actions}
						balances={context.balances}
						autoExtend={context.autoExtend}
						scope={patch ? "quilt-file" : "blob"}
						onExtended={changed}
					/>

					<PublishSection
						network={network}
						subject={publishSubject(
							blob,
							liveAndCertified,
							patch,
							name,
							mediaType,
						)}
						actions={context.actions}
					/>

					{liveAndCertified ? (
						<ShareSection
							network={network}
							links={
								patch
									? patch.entry
										? shareLinks(network.aggregatorUrl, {
												kind: "patch",
												patchId: patch.entry.patchId,
											})
										: []
									: blob.isQuilt
										? []
										: shareLinks(network.aggregatorUrl, {
												kind: "blob",
												blobId: blob.blobId,
												objectId: blob.objectId,
												hasHeaders: blob.contentType !== null,
											})
							}
							embed={
								url && !blob.isEncrypted && (!blob.isQuilt || patch)
									? embedSnippet({ url, name, contentType: mediaType })
									: null
							}
							encrypted={blob.isEncrypted}
							quilt={blob.isQuilt && !patch}
						/>
					) : null}

					<DeleteSection
						network={network}
						blob={blob}
						blocker={deleteBlocker(blob, clock)}
						quiltFile={patch !== null}
						actions={context.actions}
						onDeleted={changed}
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

/** What Publish to Morse can attach, or why it cannot (Morse docs "Entries" and "Collections"). */
function publishSubject(
	blob: BlobRecord,
	liveAndCertified: boolean,
	patch: { identifier: string; entry: { patchId: string } | null } | null,
	name: string,
	mediaType: string | null,
): PublishSubject {
	if (blob.isEncrypted)
		return {
			kind: "blocked",
			reason:
				"Encrypted files use a RecipientFile as their access policy, which Morse entries do not take.",
		};
	if (!liveAndCertified)
		return {
			kind: "blocked",
			reason:
				blob.certifiedEpoch === null
					? "Only a certified blob can be published. Finish it first."
					: "Its storage has ended, so it cannot be published.",
		};
	if (!blob.deletable)
		return {
			kind: "blocked",
			reason:
				"Morse only takes deletable blobs, so a publication can unpublish and correct. This blob is permanent.",
		};
	if (blob.isQuilt && !patch)
		return {
			kind: "blocked",
			reason:
				"A quilt goes into Morse file by file. Open the quilt and select a file to publish it.",
		};
	if (patch && !patch.entry)
		return {
			kind: "blocked",
			reason: "Reading this file's patch id from the aggregator…",
		};
	return {
		kind: "ready",
		name,
		contentType: mediaType,
		blobObjectId: blob.objectId,
		patchId: patch?.entry?.patchId ?? null,
		mode: patch ? "quilt" : "blob",
	};
}
