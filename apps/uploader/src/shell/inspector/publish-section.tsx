import { useCurrentClient } from "@mysten/dapp-kit-react";
import { type ReactNode, useId, useState } from "react";
import { CONTENT_TYPE_ATTRIBUTE } from "@/blobs/blob-attributes";
import type { QuiltPatchEntry } from "@/blobs/quilt-patch-list";
import { signatureCount } from "@/lib/batches";
import type { ChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import { mediaTypeOf } from "@/manage/preview-plan";
import {
	type AddedBatch,
	addEntries,
	type PublishEntry,
} from "@/morse/add-entries";
import { attachToMorse } from "@/morse/attach-to-morse";
import { MAX_ENTRIES_PER_TRANSACTION } from "@/morse/entry-batch";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import {
	MAX_ENTRY_NAME_BYTES,
	type PublishChoice,
} from "@/upload/publish-rules";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { CollectionPicker, useCollectionChoice } from "../collection-picker";

const UTF8 = new TextEncoder();
/** Morse needs a media type for every entry; this one means "bytes". */
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/** What can go into Morse, and why something cannot. */
export type PublishSubject =
	| {
			kind: "ready";
			name: string;
			contentType: string | null;
			blobObjectId: string;
			/** A quilt file's patch id; `null` for a standalone blob. */
			patchId: string | null;
			mode: "blob" | "quilt";
	  }
	/** A whole quilt: each of its files becomes an entry in a quilt collection. */
	| {
			kind: "quilt";
			blobObjectId: string;
			files: ChainRead<readonly QuiltPatchEntry[]>;
	  }
	| { kind: "blocked"; reason: string };

type Attaching =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "failed"; message: string }
	| { kind: "done"; entryId: number; digest: string; target: PublishChoice };

/**
 * Publish to Morse (PROTOCOL-NOTES section 12): attaches a blob the wallet
 * owns as an entry in a publication and collection it holds a PublisherCap
 * for. Blobs go into blob collections, quilt files by their patch id into
 * quilt collections, and a whole quilt adds one entry per file. A quilt
 * also offers Deploy as site, which is coming: Walrus Sites deploy is not
 * built.
 */
export function PublishSection({
	network,
	subject,
	quilt,
	actions,
}: {
	network: NetworkConfig;
	subject: PublishSubject;
	/** A whole quilt, which also offers Deploy as site. */
	quilt: boolean;
	actions: WalletActions | null;
}) {
	let body: ReactNode;
	if (subject.kind === "blocked" || actions === null)
		body = (
			<p className="note">
				{subject.kind === "blocked"
					? subject.reason
					: "Connect the wallet that owns this blob to publish it."}
			</p>
		);
	else if (subject.kind === "quilt")
		body = (
			<QuiltEntriesForm network={network} subject={subject} actions={actions} />
		);
	else
		body = <AttachForm network={network} subject={subject} actions={actions} />;
	return (
		<section
			className="sec"
			id="insp-publish"
			aria-labelledby="insp-publish-title"
		>
			<h4 id="insp-publish-title">{quilt ? "Publish" : "Publish to Morse"}</h4>
			{body}
			{quilt ? (
				<div className="acts">
					<button className="btn sm" type="button" disabled>
						Deploy as site <span className="tag soon">Coming</span>
					</button>
					<p className="note">
						Walrus Sites deploy is coming. A quilt becomes a site only when a
						Walrus Sites object points at it, and wal.app serves only Walrus
						Mainnet sites with a SuiNS name.
					</p>
				</div>
			) : null}
		</section>
	);
}

function AttachForm({
	network,
	subject,
	actions,
}: {
	network: NetworkConfig;
	subject: Extract<PublishSubject, { kind: "ready" }>;
	actions: WalletActions;
}) {
	const ids = useId();
	const client = useCurrentClient();
	const picker = useCollectionChoice(network, actions.address, subject.mode);
	const { choice } = picker;
	const [name, setName] = useState(subject.name);
	const [attaching, setAttaching] = useState<Attaching>({ kind: "idle" });
	const nameBytes = UTF8.encode(name.trim()).length;
	const nameProblem =
		nameBytes === 0
			? "Give the entry a name."
			: nameBytes > MAX_ENTRY_NAME_BYTES
				? `Entry names are at most ${MAX_ENTRY_NAME_BYTES} bytes; this one is ${nameBytes}.`
				: null;

	async function attach(target: PublishChoice) {
		setAttaching({ kind: "signing" });
		try {
			const result = await attachToMorse({
				executor: actions.executor,
				client,
				network: network.id,
				choice: target,
				name: name.trim(),
				contentType: subject.contentType ?? FALLBACK_CONTENT_TYPE,
				blobObjectId: subject.blobObjectId,
				patchId: subject.patchId,
			});
			setAttaching({ kind: "done", ...result, target });
		} catch (error) {
			setAttaching({ kind: "failed", message: describeActionError(error) });
		}
	}

	return (
		<div className="pub">
			<span>
				Attach this {subject.mode === "quilt" ? "file" : "blob"} as an entry so
				it carries a Morse record and can be read by publication. The blob stays
				in your wallet.
			</span>
			<CollectionPicker
				network={network}
				mode={subject.mode}
				state={picker}
				onPick={() => setAttaching({ kind: "idle" })}
			/>
			{picker.choices.length > 0 ? (
				<>
					<label className="sr-only" htmlFor={`${ids}-name`}>
						Entry name
					</label>
					<input
						id={`${ids}-name`}
						type="text"
						value={name}
						aria-invalid={nameProblem !== null}
						onChange={(event) => {
							setName(event.currentTarget.value);
							setAttaching({ kind: "idle" });
						}}
					/>
					{nameProblem ? (
						<span className="note warn">{nameProblem}</span>
					) : null}
					<div className="acts">
						<button
							className="btn primary sm"
							type="button"
							disabled={
								choice === null ||
								nameProblem !== null ||
								attaching.kind === "signing" ||
								attaching.kind === "done"
							}
							aria-busy={attaching.kind === "signing"}
							onClick={() => {
								if (choice) attach(choice);
							}}
						>
							{attaching.kind === "signing"
								? "Confirm in your wallet…"
								: "Add as entry · 1 tx"}
						</button>
					</div>
				</>
			) : null}
			{attaching.kind === "failed" ? (
				<span className="note warn" role="alert">
					{attaching.message}
				</span>
			) : null}
			{attaching.kind === "done" ? (
				<span className="note ok" role="status">
					Added as entry {attaching.entryId} in{" "}
					{attaching.target.publicationName} · {attaching.target.collectionName}
					.{" "}
					<a
						href={explorerTxUrl(network, attaching.digest)}
						target="_blank"
						rel="noopener noreferrer"
					>
						View transaction
					</a>
				</span>
			) : null}
		</div>
	);
}

type Adding =
	| { kind: "idle" }
	| { kind: "signing"; batches: readonly AddedBatch[] }
	| { kind: "failed"; batches: readonly AddedBatch[]; message: string }
	| { kind: "done"; batches: readonly AddedBatch[]; target: PublishChoice };

/**
 * A whole quilt as entries: one per file, by patch id, named by its path.
 * The wallet signs once per 25 entries, and the count is shown before it
 * asks. A failed batch stops the run; what was signed before it stays.
 */
function QuiltEntriesForm({
	network,
	subject,
	actions,
}: {
	network: NetworkConfig;
	subject: Extract<PublishSubject, { kind: "quilt" }>;
	actions: WalletActions;
}) {
	const client = useCurrentClient();
	const picker = useCollectionChoice(network, actions.address, "quilt");
	const { choice } = picker;
	const [adding, setAdding] = useState<Adding>({ kind: "idle" });
	const files = subject.files.status === "ready" ? subject.files.data : null;
	const tooLong = (files ?? []).filter(
		(file) => UTF8.encode(file.identifier).length > MAX_ENTRY_NAME_BYTES,
	);
	const entries: PublishEntry[] = (files ?? [])
		.filter((file) => !tooLong.includes(file))
		.map((file) => ({
			name: file.identifier,
			contentType:
				mediaTypeOf(
					file.tags[CONTENT_TYPE_ATTRIBUTE] ?? null,
					file.identifier,
				) ?? FALLBACK_CONTENT_TYPE,
			blobObjectId: subject.blobObjectId,
			patchId: file.patchId,
		}));
	const signatures = signatureCount(
		entries.length,
		MAX_ENTRIES_PER_TRANSACTION,
	);
	const added = adding.kind === "idle" ? [] : adding.batches;
	const addedCount = added.reduce(
		(sum, batch) => sum + batch.entryIds.length,
		0,
	);

	async function add(target: PublishChoice, from: number) {
		const done = [...added];
		setAdding({ kind: "signing", batches: done });
		try {
			await addEntries({
				executor: actions.executor,
				client,
				network: network.id,
				choice: target,
				entries: entries.slice(from),
				onAdded: (batch) => {
					done.push({ ...batch, offset: batch.offset + from });
					setAdding({ kind: "signing", batches: [...done] });
				},
			});
			setAdding({ kind: "done", batches: done, target });
		} catch (error) {
			setAdding({
				kind: "failed",
				batches: done,
				message: describeActionError(error),
			});
		}
	}

	return (
		<div className="pub">
			<span>
				Attach this quilt's files to a Morse publication as entries, one per
				file by its patch id. The quilt stays in your wallet.
			</span>
			{subject.files.status === "error" ? (
				<span className="note warn">
					The aggregator could not list this quilt's files, so they cannot be
					added yet.
				</span>
			) : files === null ? (
				<span className="note" role="status">
					Reading the quilt's files…
				</span>
			) : (
				<>
					<CollectionPicker
						network={network}
						mode="quilt"
						state={picker}
						onPick={() => setAdding({ kind: "idle" })}
					/>
					{tooLong.length > 0 ? (
						<span className="note">
							{tooLong.length === 1
								? "1 file is"
								: `${tooLong.length} files are`}{" "}
							left out: entry names are at most {MAX_ENTRY_NAME_BYTES} bytes.
						</span>
					) : null}
					{picker.choices.length > 0 && entries.length > 0 ? (
						<div className="acts">
							<button
								className="btn primary sm"
								type="button"
								disabled={
									choice === null ||
									adding.kind === "signing" ||
									adding.kind === "done"
								}
								aria-busy={adding.kind === "signing"}
								onClick={() => {
									if (choice) void add(choice, addedCount);
								}}
							>
								{adding.kind === "signing"
									? `Confirm in your wallet… ${addedCount} of ${entries.length} added`
									: adding.kind === "failed"
										? `Add the other ${entries.length - addedCount} · ${signatureCount(entries.length - addedCount, MAX_ENTRIES_PER_TRANSACTION)} ${signatureWord(signatureCount(entries.length - addedCount, MAX_ENTRIES_PER_TRANSACTION))}`
										: `Add ${entries.length === 1 ? "1 entry" : `${entries.length} entries`} · ${signatures} ${signatureWord(signatures)}`}
							</button>
						</div>
					) : null}
					{picker.choices.length > 0 && entries.length > 0 ? (
						<small className="hint">
							Your wallet asks once per {MAX_ENTRIES_PER_TRANSACTION} entries:{" "}
							{signatures} {signatureWord(signatures)} for {entries.length}.
						</small>
					) : null}
				</>
			)}
			{adding.kind === "failed" ? (
				<span className="note warn" role="alert">
					{addedCount > 0
						? `Added ${addedCount} of ${entries.length}, then stopped: `
						: ""}
					{adding.message}
				</span>
			) : null}
			{added.length > 0 ? (
				<span
					className={adding.kind === "done" ? "note ok" : "note"}
					role="status"
				>
					{adding.kind === "done"
						? `Added ${addedCount === 1 ? "1 entry" : `${addedCount} entries`} in ${adding.target.publicationName} · ${adding.target.collectionName}, entries ${firstId(added)} to ${lastId(added)}.`
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
				</span>
			) : null}
		</div>
	);
}

function signatureWord(count: number): string {
	return count === 1 ? "signature" : "signatures";
}

function firstId(batches: readonly AddedBatch[]): number | undefined {
	return batches[0]?.entryIds[0];
}

function lastId(batches: readonly AddedBatch[]): number | undefined {
	return batches.at(-1)?.entryIds.at(-1);
}
