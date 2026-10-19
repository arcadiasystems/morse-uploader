import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useMemo, useState } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { signatureCount } from "@/lib/batches";
import { describeActionError } from "@/manage/action-error";
import { bulkEligibility } from "@/manage/bulk-eligibility";
import { mediaTypeOf } from "@/manage/preview-plan";
import {
	type AddedBatch,
	addEntries,
	type PublishEntry,
} from "@/morse/add-entries";
import { MAX_ENTRIES_PER_TRANSACTION } from "@/morse/entry-batch";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import {
	MAX_ENTRY_NAME_BYTES,
	type PublishChoice,
} from "@/upload/publish-rules";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { CollectionPicker, useCollectionChoice } from "../collection-picker";
import { BulkSheet, LeftOutList, rowNames } from "./bulk-sheet";

const UTF8 = new TextEncoder();
/** Morse needs a media type for every entry; this one means "bytes". */
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

type Adding =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "failed"; message: string }
	| { kind: "done"; target: PublishChoice };

/**
 * Publish the selection to Morse (PROTOCOL-NOTES section 12): each blob
 * becomes an entry in one blob collection the wallet holds a PublisherCap
 * for, named by its name. Up to 25 entries go in one transaction, and the
 * sheet says how many signatures that is before the wallet asks. Morse
 * takes certified, deletable, unencrypted blobs; a quilt's files go in from
 * its inspector, into a quilt collection.
 */
export function BulkPublishSheet({
	network,
	rows,
	clock,
	actions,
	onClose,
	onPublished,
}: {
	network: NetworkConfig;
	rows: readonly BlobRow[];
	clock: EpochClock;
	actions: WalletActions;
	onClose: () => void;
	onPublished: () => void;
}) {
	const client = useCurrentClient();
	const picker = useCollectionChoice(network, actions.address, "blob");
	const { choice } = picker;
	const [adding, setAdding] = useState<Adding>({ kind: "idle" });
	const [added, setAdded] = useState<readonly AddedBatch[]>([]);
	const { eligible, leftOut } = useMemo(
		() => bulkEligibility("publish", rows, clock, network.maxEpochsAhead),
		[rows, clock, network.maxEpochsAhead],
	);
	const tooLong = eligible.filter(
		(row) => UTF8.encode(row.label).length > MAX_ENTRY_NAME_BYTES,
	);
	const entries: PublishEntry[] = eligible
		.filter((row) => !tooLong.includes(row))
		.map((row) => ({
			name: row.label,
			contentType:
				mediaTypeOf(row.blob.contentType, row.blob.name ?? "") ??
				FALLBACK_CONTENT_TYPE,
			blobObjectId: row.blob.objectId,
			patchId: null,
		}));
	const addedCount = added.reduce(
		(sum, batch) => sum + batch.entryIds.length,
		0,
	);
	const rest = entries.slice(addedCount);
	const signatures = signatureCount(rest.length, MAX_ENTRIES_PER_TRANSACTION);

	async function publish(target: PublishChoice) {
		setAdding({ kind: "signing" });
		const offset = addedCount;
		let signedAny = false;
		try {
			await addEntries({
				executor: actions.executor,
				client,
				network: network.id,
				choice: target,
				entries: rest,
				onAdded: (batch) => {
					signedAny = true;
					setAdded((previous) => [
						...previous,
						{ ...batch, offset: batch.offset + offset },
					]);
				},
			});
			setAdding({ kind: "done", target });
		} catch (error) {
			setAdding({ kind: "failed", message: describeActionError(error) });
		} finally {
			if (signedAny) onPublished();
		}
	}

	return (
		<BulkSheet
			title="Publish to Morse"
			intro="Each blob becomes an entry in one collection of a publication you can write to. The blobs stay in your wallet; the entries point at them."
			onClose={onClose}
			aside={
				<>
					<h4>Collection</h4>
					{entries.length > 0 ? (
						<div className="pub">
							<CollectionPicker
								network={network}
								mode="blob"
								state={picker}
								onPick={() => setAdding({ kind: "idle" })}
							/>
						</div>
					) : null}
					<dl className="cost">
						<div>
							<dt>Entries</dt>
							<dd>{rest.length}</dd>
						</div>
						<div>
							<dt>Signatures</dt>
							<dd>{signatures}</dd>
						</div>
					</dl>
					<p className="note">
						Your wallet asks once per {MAX_ENTRIES_PER_TRANSACTION} entries.
						Each transaction is simulated first, so a Morse abort shows here
						before anything is signed.
					</p>
					{adding.kind === "failed" ? (
						<p className="note warn" role="alert">
							{addedCount > 0
								? `Added ${addedCount} of ${entries.length}, then: `
								: ""}
							{adding.message}
						</p>
					) : null}
					{added.length > 0 ? (
						<p className="note" role="status">
							{adding.kind === "done"
								? `Added ${addedCount === 1 ? "1 entry" : `${addedCount} entries`} in ${adding.target.publicationName} · ${adding.target.collectionName}.`
								: `${addedCount} added so far.`}{" "}
							{added.map((batch, index) => (
								<a
									key={batch.digest}
									href={explorerTxUrl(network, batch.digest)}
									target="_blank"
									rel="noopener noreferrer"
								>
									{added.length === 1
										? "View transaction"
										: `Transaction ${index + 1}`}
								</a>
							))}
						</p>
					) : null}
					<div className="acts">
						<button
							className="btn primary"
							type="button"
							disabled={
								choice === null ||
								rest.length === 0 ||
								adding.kind === "signing"
							}
							aria-busy={adding.kind === "signing"}
							onClick={() => {
								if (choice) void publish(choice);
							}}
						>
							{adding.kind === "signing"
								? "Confirm in your wallet…"
								: `Add ${rest.length === 1 ? "1 entry" : `${rest.length} entries`} · ${signatures} ${signatures === 1 ? "signature" : "signatures"}`}
						</button>
						<button className="btn" type="button" onClick={onClose}>
							{adding.kind === "done" ? "Close" : "Cancel"}
						</button>
					</div>
				</>
			}
		>
			<p className="note">
				{entries.length === 0
					? "None of the selected blobs can go into Morse."
					: `${entries.length === 1 ? "1 blob" : `${entries.length} blobs`} can be published: ${rowNames(eligible.filter((row) => !tooLong.includes(row)))}.`}
			</p>
			{tooLong.length > 0 ? (
				<p className="note">
					{rowNames(tooLong)}: names over Morse's {MAX_ENTRY_NAME_BYTES} bytes,
					left out.
				</p>
			) : null}
			<LeftOutList leftOut={leftOut} maxEpochsAhead={network.maxEpochsAhead} />
		</BulkSheet>
	);
}
