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
import type { Balances, WalrusPrices } from "@/funds/types";
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
import { DownloadButton } from "./download-button";
import { EncryptedSection } from "./encrypted-section";
import { FinishSection } from "./finish-section";
import { type InspectorTarget, targetRow } from "./inspector-target";
import { PreviewSection } from "./preview-section";
import { PublishSection, type PublishSubject } from "./publish-section";
import { QuiltFilesSection } from "./quilt-files-section";
import { RecordSection } from "./record-section";
import { ShareSection } from "./share-section";
import { StorageSection } from "./storage-section";
import { VerifySection } from "./verify-section";

/** Sections a row's menu, the palette or the action row can open the inspector at. */
export type InspectorSection = "verify" | "storage" | "publish" | "share";

/**
 * A request to show a section, and optionally to start its action: run
 * Verify, or open the extend panel. `request` grows with each ask, so the
 * same section can be asked for twice.
 */
export interface InspectorRequest {
	section: InspectorSection;
	action: "verify" | "extend" | null;
	request: number;
}

/** What the inspector needs from the shell: signing, balances, prices, auto-extend and a way to re-read. */
export interface InspectorContext {
	actions: WalletActions | null;
	balances: ChainRead<Balances>;
	prices: ChainRead<WalrusPrices>;
	autoExtend: AutoExtend | null;
	/** Something changed on chain: the list and balances read again. */
	onChanged: () => void;
}

/**
 * The inspector (design/v2/app.html): a persistent column for the
 * selection, with actions, verification, storage with extend and
 * auto-extend, the record, a quilt's files by path, share, publish and
 * delete, plus Finish or the encrypted section where they apply. It shows
 * a blob, a quilt, or one file in a quilt. The record is read live from
 * chain when it opens and after every change it makes.
 */
export function Inspector({
	target,
	network,
	listed,
	context,
	request,
	onClose,
}: {
	target: InspectorTarget;
	network: NetworkConfig;
	listed: ListedBlobs;
	context: InspectorContext;
	request: InspectorRequest | null;
	onClose: () => void;
}) {
	const client = useCurrentClient();
	const panel = useRef<HTMLElement>(null);
	const row = targetRow(target);
	const objectId = row.blob.objectId;
	// Kept here: Finish's own section goes once the blob reads as certified.
	const [certifiedBy, setCertifiedBy] = useState<string | null>(null);
	const [verifyRequest, setVerifyRequest] = useState(0);
	const [extendOpen, setExtendOpen] = useState(false);
	// Refreshed after each change, so the last record stays on screen meanwhile.
	const { read: live, refresh: readAgain } = useChainRead(
		`${network.id}:live:${objectId}`,
		(signal) => readLiveBlob(client, objectId, signal),
	);
	const isWholeQuilt = target.kind === "blob" && row.blob.isQuilt;
	const quiltFiles = useChainRead(
		target.kind === "patch" || isWholeQuilt
			? `${network.id}:patches:${row.blob.blobId}`
			: null,
		() => readQuiltPatchList(network.aggregatorUrl, row.blob.blobId),
	);
	const patchFiles = quiltFiles.read;

	// A request from outside (a row's menu, the palette) shows its section and starts its action.
	useEffect(() => {
		if (request === null) return;
		if (request.action === "verify") setVerifyRequest((value) => value + 1);
		if (request.action === "extend") setExtendOpen(true);
		panel.current
			?.querySelector(`#insp-${request.section}`)
			?.scrollIntoView({ block: "start" });
	}, [request]);

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

	function show(section: InspectorSection | "files" | "encrypted" | "finish") {
		panel.current
			?.querySelector(`#insp-${section}`)
			?.scrollIntoView({ block: "start" });
	}

	function onKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (event.key === "Escape") {
			event.stopPropagation();
			onClose();
		}
	}

	const patchEntry =
		target.kind === "patch" && patchFiles.status === "ready"
			? (patchFiles.data.find(
					(entry) => entry.identifier === target.identifier,
				) ?? null)
			: null;
	const patch =
		target.kind === "patch"
			? {
					identifier: target.identifier,
					entry: patchEntry,
					// Why the patch id is not known, while it is not.
					missing:
						patchFiles.status === "error"
							? "The aggregator could not list this quilt's files."
							: patchFiles.status === "ready"
								? `The aggregator does not list ${target.identifier} in this quilt.`
								: "Reading this file's patch id from the aggregator…",
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
	const fileCount =
		isWholeQuilt && patchFiles.status === "ready"
			? patchFiles.data.length
			: null;
	const storagePricePerUnit =
		context.prices.status === "ready"
			? context.prices.data.storagePerUnit
			: null;
	const downloadable =
		liveAndCertified && !blob.isEncrypted && (!blob.isQuilt || patch !== null);

	return (
		<aside
			className="insp"
			ref={panel}
			aria-label={`Details of ${name}`}
			onKeyDown={onKeyDown}
		>
			<div className="hd">
				<span
					className={
						blob.isEncrypted ? "ic enc" : isWholeQuilt ? "ic quilt" : "ic"
					}
				>
					<Icon name={headerIcon(blob, mediaType, patch !== null)} />
				</span>
				<div>
					<h3>{name}</h3>
					<small>
						{patch
							? `file in quilt ${row.label}${mediaType ? ` · ${mediaType}` : ""}`
							: [
									blob.isEncrypted
										? "Seal-encrypted"
										: isWholeQuilt
											? "quilt"
											: (mediaType ?? "blob"),
									fileCount === null
										? null
										: fileCount === 1
											? "1 file"
											: `${fileCount} files`,
									formatBytes(blob.size),
									`uploaded about ${formatShortDate(registeredAtMs, nowMs)}`,
								]
									.filter((part) => part !== null)
									.join(" · ")}
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
						inspector shows the list's copy, which may be behind.{" "}
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
					<section className="sec" aria-label="Actions">
						<div className="acts">
							{!certified && !expired && !patch ? (
								<button
									className="btn sm solid"
									type="button"
									onClick={() => show("finish")}
								>
									Finish
								</button>
							) : blob.isEncrypted && !patch ? (
								<button
									className="btn sm solid"
									type="button"
									onClick={() => show("encrypted")}
								>
									Decrypt
								</button>
							) : isWholeQuilt ? (
								<button
									className="btn sm solid"
									type="button"
									onClick={() => show("files")}
								>
									Files
								</button>
							) : (
								<DownloadButton
									url={downloadable ? url : null}
									name={name}
									mediaType={mediaType}
								/>
							)}
							<button
								className="btn sm"
								type="button"
								disabled={!liveAndCertified}
								title={
									liveAndCertified
										? undefined
										: "Only a certified blob with storage left has links to share."
								}
								onClick={() => show("share")}
							>
								Share
							</button>
							<button
								className="btn sm"
								type="button"
								onClick={() => {
									setExtendOpen(true);
									show("storage");
								}}
							>
								Extend
							</button>
							<button
								className="btn sm"
								type="button"
								onClick={() => {
									setVerifyRequest((value) => value + 1);
									show("verify");
								}}
							>
								Verify
							</button>
						</div>
					</section>

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
					) : isWholeQuilt ? null : !liveAndCertified ? (
						<section className="sec" aria-label="Preview">
							<div className="thumb">
								<span className="msg">
									Its storage has ended, so aggregators may no longer serve its
									bytes.
								</span>
							</div>
						</section>
					) : url ? (
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
									{patch?.missing}
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
							runRequest={verifyRequest}
						/>
					) : null}

					<StorageSection
						network={network}
						blob={blob}
						status={status}
						clock={clock}
						nowMs={nowMs}
						actions={context.actions}
						balances={context.balances}
						storagePricePerUnit={storagePricePerUnit}
						autoExtend={context.autoExtend}
						scope={patch ? "quilt-file" : "blob"}
						extendOpen={extendOpen}
						onToggleExtend={() => setExtendOpen((open) => !open)}
						onExtended={changed}
					/>

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

					{isWholeQuilt && liveAndCertified ? (
						<QuiltFilesSection
							aggregatorUrl={network.aggregatorUrl}
							quiltBlobId={blob.blobId}
							files={patchFiles}
							onRetry={quiltFiles.refresh}
						/>
					) : null}

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
							quilt={isWholeQuilt}
						/>
					) : null}

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
	patch: {
		identifier: string;
		entry: { patchId: string } | null;
		missing: string;
	} | null,
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
	if (patch && !patch.entry) return { kind: "blocked", reason: patch.missing };
	return {
		kind: "ready",
		name,
		contentType: mediaType,
		blobObjectId: blob.objectId,
		patchId: patch?.entry?.patchId ?? null,
		mode: patch ? "quilt" : "blob",
	};
}
