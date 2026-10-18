import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useId, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { describeActionError } from "@/manage/action-error";
import { attachToMorse } from "@/morse/attach-to-morse";
import { usePublishTargets } from "@/morse/use-publish-targets";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import {
	choiceKey,
	choiceLabel,
	type PublishChoice,
	publishChoices,
} from "@/upload/publish-rules";
import type { WalletActions } from "@/wallet/use-wallet-actions";

/** `ENameTooLong` aborts above this many bytes (`entry.move`). */
const MAX_ENTRY_NAME_BYTES = 256;
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
	| { kind: "blocked"; reason: string };

type Attaching =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "failed"; message: string }
	| { kind: "done"; entryId: number; digest: string; target: PublishChoice };

/**
 * Publish to Morse (PROTOCOL-NOTES section 12): attaches a blob the wallet
 * owns as an entry in a publication and collection it holds a PublisherCap
 * for, in one transaction. Blobs go into blob collections, quilt files by
 * their patch id into quilt collections.
 */
export function PublishSection({
	network,
	subject,
	actions,
}: {
	network: NetworkConfig;
	subject: PublishSubject;
	actions: WalletActions | null;
}) {
	return (
		<section
			className="sec"
			id="drawer-publish"
			aria-labelledby="drawer-publish-title"
		>
			<h4 id="drawer-publish-title">Publish to Morse</h4>
			{subject.kind === "blocked" || actions === null ? (
				<p className="note">
					{subject.kind === "blocked"
						? subject.reason
						: "Connect the wallet that owns this blob to publish it."}
				</p>
			) : (
				<AttachForm network={network} subject={subject} actions={actions} />
			)}
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
	const targets = usePublishTargets(network.id, actions.address);
	const choices =
		targets.read.status === "ready"
			? publishChoices(targets.read.data, subject.mode)
			: [];
	const [choiceId, setChoiceId] = useState<string | null>(null);
	const choice =
		choices.find((option) => choiceKey(option) === choiceId) ??
		choices[0] ??
		null;
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

	const collectionWord = subject.mode === "quilt" ? "quilt" : "blob";
	return (
		<div className="pub">
			<span>
				Attach this {subject.mode === "quilt" ? "file" : "blob"} as an entry so
				it carries a Morse record and can be read by publication. The blob stays
				in your wallet.
			</span>
			{targets.read.status === "loading" || targets.read.status === "idle" ? (
				<span className="note" role="status">
					Reading the publications this wallet can publish to…
				</span>
			) : targets.read.status === "error" ? (
				<span className="note warn" role="alert">
					Could not read your publications: {errorMessage(targets.read.error)}{" "}
					<button className="cp" type="button" onClick={targets.refresh}>
						Try again
					</button>
				</span>
			) : choices.length === 0 ? (
				<span className="note">
					This wallet holds no PublisherCap for a {collectionWord} collection on{" "}
					{network.label}. A {collectionWord} collection takes{" "}
					{subject.mode === "quilt" ? "files from quilts" : "standalone blobs"}.
				</span>
			) : (
				<>
					<label className="sr-only" htmlFor={`${ids}-target`}>
						Publication and collection
					</label>
					<select
						id={`${ids}-target`}
						value={choice ? choiceKey(choice) : ""}
						onChange={(event) => {
							setChoiceId(event.currentTarget.value);
							setAttaching({ kind: "idle" });
						}}
					>
						{choices.map((option) => (
							<option key={choiceKey(option)} value={choiceKey(option)}>
								{choiceLabel(option, choices)}
							</option>
						))}
					</select>
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
					<button
						className="btn btn-ultra xs"
						type="button"
						style={{ alignSelf: "flex-start" }}
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
				</>
			)}
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
