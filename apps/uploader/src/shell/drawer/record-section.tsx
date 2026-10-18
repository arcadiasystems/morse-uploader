import type { BlobRecord } from "@/blobs/blob-record";
import { shortenBlobId } from "@/blobs/blob-row";
import { formatBytes } from "@/lib/format-bytes";
import { shortenAddress } from "@/lib/shorten-address";
import { useClipboardCopy } from "@/lib/use-clipboard-copy";
import { explorerObjectUrl, explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";

/** RS2 is `encoding_type` 1 (PROTOCOL-NOTES section 7). */
const ENCODING_NAMES: Readonly<Record<number, string>> = {
	0: "RedStuff",
	1: "RS2",
};

/** The owner from the live read: `address` is `null` when the object is not address-owned. */
export type OwnerRead =
	| { kind: "reading" }
	| { kind: "unavailable" }
	| { kind: "known"; address: string | null };

export interface PatchRecord {
	identifier: string;
	/** `null` until the aggregator's patch list is read, or when it could not be. */
	patchId: string | null;
}

/**
 * The blob's record on Sui, as the design lists it: ids with links to the
 * network's explorer, epochs, encoding with the size actually billed, and
 * the owner. The epochs come from chain; the design's upload date has no
 * on-chain source.
 */
export function RecordSection({
	network,
	blob,
	previousTransaction,
	owner,
	viewer,
	patch,
}: {
	network: NetworkConfig;
	blob: BlobRecord;
	previousTransaction: string | null;
	/** The owning address as chain reports it. */
	owner: OwnerRead;
	/** The connected address, to mark the owner as "you". */
	viewer: string | null;
	patch: PatchRecord | null;
}) {
	const encoding =
		ENCODING_NAMES[blob.encodingType] ?? `type ${blob.encodingType}`;
	return (
		<section className="sec" aria-labelledby="drawer-record">
			<h4 id="drawer-record">Record</h4>
			<dl>
				{patch ? (
					<>
						<dt>File</dt>
						<dd>{patch.identifier}</dd>
						<dt>Patch id</dt>
						<dd>
							{patch.patchId === null ? (
								<span className="muted">reading…</span>
							) : (
								<>
									{shortenBlobId(patch.patchId)}
									<CopyLink value={patch.patchId} label="patch id" />
								</>
							)}
						</dd>
					</>
				) : null}
				<dt>{patch ? "Quilt blob id" : "Blob id"}</dt>
				<dd>
					{blob.blobId}
					<CopyLink value={blob.blobId} label="blob id" />
				</dd>
				<dt>{patch ? "Quilt object" : "Blob object"}</dt>
				<dd>
					<a
						href={explorerObjectUrl(network, blob.objectId)}
						target="_blank"
						rel="noopener noreferrer"
						title={blob.objectId}
					>
						{shortenAddress(blob.objectId)}
					</a>{" "}
					on Sui
					<CopyLink value={blob.objectId} label="object id" />
				</dd>
				{previousTransaction ? (
					<>
						<dt>Last changed</dt>
						<dd>
							tx{" "}
							<a
								href={explorerTxUrl(network, previousTransaction)}
								target="_blank"
								rel="noopener noreferrer"
								title={previousTransaction}
							>
								{shortenBlobId(previousTransaction)}
							</a>
						</dd>
					</>
				) : null}
				<dt>Epochs</dt>
				<dd>
					registered {blob.registeredEpoch} ·{" "}
					{blob.certifiedEpoch === null
						? "not certified"
						: `certified ${blob.certifiedEpoch}`}{" "}
					· ends {blob.endEpoch}
				</dd>
				<dt>Encoding</dt>
				<dd>
					{encoding} · {formatBytes(blob.size)} →{" "}
					{formatBytes(blob.encodedSize)} encoded
				</dd>
				{blob.contentType && !patch ? (
					<>
						<dt>Type</dt>
						<dd>{blob.contentType}</dd>
					</>
				) : null}
				<dt>Deletable</dt>
				<dd>{blob.deletable ? "yes" : "no, permanent"}</dd>
				<dt>Owner</dt>
				<dd>
					{owner.kind === "reading"
						? "reading…"
						: owner.kind === "unavailable" || owner.address === null
							? "unavailable"
							: `${shortenAddress(owner.address)}${viewer !== null && owner.address === viewer ? " (you)" : ""}`}
				</dd>
			</dl>
		</section>
	);
}

/** The design's small "Copy" after an id. */
function CopyLink({ value, label }: { value: string; label: string }) {
	const { state, copy } = useClipboardCopy();
	return (
		<>
			<button
				className="cp"
				type="button"
				aria-label={`Copy ${label}`}
				title={
					state === "failed"
						? `The browser blocked the clipboard: ${value}`
						: undefined
				}
				onClick={() => copy(value)}
			>
				{state === "copied"
					? "Copied"
					: state === "failed"
						? "Blocked"
						: "Copy"}
			</button>
			<span className="sr-only" role="status">
				{state === "copied" ? `${label} copied` : ""}
			</span>
		</>
	);
}
