import { useCurrentClient } from "@mysten/dapp-kit-react";
import type { Transaction } from "@mysten/sui/transactions";
import { NotEnoughBlobConfirmationsError } from "@mysten/walrus";
import { useId, useRef, useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import { formatShortDate } from "@/lib/format-date";
import { useMountedSignal } from "@/lib/use-mounted-signal";
import { describeActionError } from "@/manage/action-error";
import {
	certifyFromNodes,
	type PaidTip,
	uploadAgain,
} from "@/manage/finish-registered";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";

type Finishing =
	| { kind: "idle" }
	| { kind: "working"; step: string }
	/** The nodes do not hold the slivers: the original file is needed. */
	| { kind: "needs-file" }
	| { kind: "failed"; message: string; needsFile: boolean }
	/** Certified: the inspector shows the result and reads the blob again. */
	| { kind: "done" };

/**
 * Finish for a Registered blob from the Walrus pane, with no saved upload
 * (PROTOCOL-NOTES section 6). It first asks the storage nodes to confirm
 * they hold the blob and certifies with one signature. When they do not,
 * the original file can be chosen again: if it encodes to the same blob id,
 * it is uploaded through the relay (a tip signature) and certified (a
 * second one). Encrypted files and quilts cannot be rebuilt that way, and
 * the section says why.
 */
export function FinishSection({
	network,
	blob,
	expiresAtMs,
	nowMs,
	actions,
	onFinished,
}: {
	network: NetworkConfig;
	blob: BlobRecord;
	expiresAtMs: number;
	nowMs: number;
	actions: WalletActions | null;
	/** Certify went through, with its digest. */
	onFinished: (digest: string) => void;
}) {
	const ids = useId();
	const client = useCurrentClient();
	const [state, setState] = useState<Finishing>({ kind: "idle" });
	const busy = state.kind === "working";
	const rebuildable = !blob.isEncrypted && !blob.isQuilt;
	// Node reads stop when the inspector closes or shows another blob.
	const mountedSignal = useMountedSignal();
	// A tip paid by an attempt whose relay upload failed, reused by the retry.
	const paidTip = useRef<PaidTip | null>(null);

	async function certify(build: (signal: AbortSignal) => Promise<Transaction>) {
		if (!actions) return;
		const signal = mountedSignal();
		const transaction = await build(signal);
		// The inspector closed or moved on while nodes answered: ask nothing.
		if (signal.aborted) return;
		setState({
			kind: "working",
			step: "Sign the certify transaction in your wallet…",
		});
		const executed = await actions.executor.execute(transaction, signal);
		setState({ kind: "done" });
		onFinished(executed.digest);
	}

	async function finishFromNodes() {
		setState({
			kind: "working",
			step: "Asking storage nodes to confirm they hold it…",
		});
		try {
			await certify((signal) => certifyFromNodes(client, blob, signal));
		} catch (error) {
			if (error instanceof NotEnoughBlobConfirmationsError)
				setState({ kind: "needs-file" });
			else
				setState({
					kind: "failed",
					message: describeActionError(error),
					needsFile: false,
				});
		}
	}

	async function finishFromFile(chosen: File) {
		if (!actions) return;
		setState({
			kind: "working",
			step: "Checking the file against the blob id…",
		});
		try {
			const bytes = new Uint8Array(await chosen.arrayBuffer());
			await certify((signal) =>
				uploadAgain({
					network,
					client,
					executor: actions.executor,
					blob,
					bytes,
					paidTip: paidTip.current,
					signal,
					onStep: (step) => {
						if (step.kind === "tip-paid") paidTip.current = step.tip;
						setState({
							kind: "working",
							step:
								step.kind === "tip-paid"
									? "Uploading through the relay…"
									: "Uploaded. Preparing the certify transaction…",
						});
					},
				}),
			);
		} catch (error) {
			setState({
				kind: "failed",
				message: describeActionError(error),
				needsFile: true,
			});
		}
	}

	const showFile =
		state.kind === "needs-file" || (state.kind === "failed" && state.needsFile);

	return (
		<section className="sec" aria-labelledby="insp-finish">
			<h4 id="insp-finish">Finish</h4>
			<p className="ver warn">
				<i aria-hidden="true" />
				Registered, not certified. Until certify, nodes have not confirmed they
				hold it and aggregators will not serve it. Certify before epoch{" "}
				{blob.endEpoch}, about {formatShortDate(expiresAtMs, nowMs)}, when its
				storage ends.
			</p>
			{state.kind === "done" ? (
				<p className="note" role="status">
					Certify went through; reading the blob again…
				</p>
			) : actions === null ? (
				<p className="note">
					Connect the wallet that owns this blob to finish it.
				</p>
			) : (
				<>
					<div className="acts">
						<button
							className="btn primary sm"
							type="button"
							disabled={busy}
							aria-busy={busy}
							onClick={finishFromNodes}
						>
							Finish · 1 signature
						</button>
					</div>
					<p className="hint">
						Finish asks the storage nodes for fresh confirmations and certifies
						the blob in one transaction. It works when the upload reached the
						nodes but certify never ran.
					</p>
					{state.kind === "working" ? (
						<p className="note" role="status">
							{state.step}
						</p>
					) : null}
					{state.kind === "failed" ? (
						<p className="note warn" role="alert">
							{state.message}
						</p>
					) : null}
					{showFile ? (
						rebuildable ? (
							<div className="panel">
								<p>
									The storage nodes do not hold this blob. Choose the original
									file to upload it again: Morse Uploader checks that it encodes
									to the same blob id, then asks you to sign a relay tip and the
									certify, 2 signatures.
								</p>
								<label className="hint" htmlFor={`${ids}-file`}>
									Original file ({blob.name ?? "same bytes as the blob"})
								</label>
								<input
									id={`${ids}-file`}
									type="file"
									disabled={busy}
									onChange={(event) => {
										const chosen = event.currentTarget.files?.[0];
										if (chosen) finishFromFile(chosen);
									}}
								/>
							</div>
						) : (
							<p className="note">
								The storage nodes do not hold this blob, and it cannot be
								rebuilt here:{" "}
								{blob.isEncrypted
									? "encryption used a fresh random key, so encrypting the same file again gives different bytes and a different blob id."
									: "a quilt's blob id depends on the exact files, names and order it was built from, which Morse Uploader does not rebuild."}{" "}
								Upload the file again as a new blob.
								{blob.deletable
									? " This one can be deleted to get its storage back."
									: ""}
							</p>
						)
					) : null}
				</>
			)}
		</section>
	);
}
