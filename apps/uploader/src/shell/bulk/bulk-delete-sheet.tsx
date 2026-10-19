import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlobRow } from "@/blobs/blob-row";
import type { EpochClock } from "@/blobs/epoch-clock";
import { TokenAmount } from "@/components/token-amount";
import { inBatches, signatureCount } from "@/lib/batches";
import { useChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import {
	buildDeleteManyTransaction,
	MAX_DELETES_PER_TRANSACTION,
	simulateTransaction,
} from "@/manage/blob-transactions";
import { bulkEligibility } from "@/manage/bulk-eligibility";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";
import { BulkSheet, LeftOutList, rowNames } from "./bulk-sheet";

type Deleting =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "failed"; message: string }
	| { kind: "done" };

/**
 * Delete for the selection (PROTOCOL-NOTES section 8 and section 13, item
 * 16), only for deletable blobs whose storage has not ended; the others are
 * left out with why. It takes two steps in the page, as the inspector's
 * delete does: the first simulates every transaction against chain and says
 * what it does, the second signs, up to 50 deletes per transaction. No WAL
 * comes back: each blob's Storage object returns to the wallet, and copies
 * others keep are not removed.
 */
export function BulkDeleteSheet({
	network,
	rows,
	clock,
	actions,
	onClose,
	onDeleted,
}: {
	network: NetworkConfig;
	rows: readonly BlobRow[];
	clock: EpochClock;
	actions: WalletActions;
	onClose: () => void;
	onDeleted: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const { eligible, leftOut } = useMemo(
		() => bulkEligibility("delete", rows, clock, network.maxEpochsAhead),
		[rows, clock, network.maxEpochsAhead],
	);
	// The list refreshes after a delete; the blobs this sheet deletes stay fixed.
	const [targets] = useState(() => eligible);
	const signatures = signatureCount(
		targets.length,
		MAX_DELETES_PER_TRANSACTION,
	);

	return (
		<BulkSheet
			title="Delete the selection"
			intro="Deleting returns each blob's storage to your wallet as a Storage object that a later upload of the same size or smaller, for the same period, can reuse. No WAL is refunded. Copies other people keep, caches and past storage nodes' slivers are not removed."
			onClose={onClose}
			aside={
				<>
					<h4>Delete</h4>
					<dl className="cost">
						<div>
							<dt>Blobs deleted</dt>
							<dd>{targets.length}</dd>
						</div>
						<div>
							<dt>Signatures</dt>
							<dd>{signatures}</dd>
						</div>
					</dl>
					{confirming ? (
						<ConfirmDelete
							network={network}
							targets={targets}
							actions={actions}
							signatures={signatures}
							onCancel={() => setConfirming(false)}
							onDeleted={onDeleted}
						/>
					) : (
						<div className="acts">
							<button
								className="btn danger"
								type="button"
								disabled={targets.length === 0}
								onClick={() => setConfirming(true)}
							>
								Delete{" "}
								{targets.length === 1 ? "1 blob" : `${targets.length} blobs`} ·
								returns their storage to your wallet
							</button>
							<button className="btn" type="button" onClick={onClose}>
								Cancel
							</button>
						</div>
					)}
				</>
			}
		>
			<p className="note">
				{targets.length === 0
					? "None of the selected blobs can be deleted: only deletable blobs whose storage has not ended can."
					: `${targets.length === 1 ? "1 blob" : `${targets.length} blobs`} to delete: ${rowNames(targets)}.`}
			</p>
			<LeftOutList leftOut={leftOut} maxEpochsAhead={network.maxEpochsAhead} />
		</BulkSheet>
	);
}

/**
 * The second step: the simulated outcome of every transaction, and the
 * button that signs them. Keep them is focused first, the safe choice.
 */
function ConfirmDelete({
	network,
	targets,
	actions,
	signatures,
	onCancel,
	onDeleted,
}: {
	network: NetworkConfig;
	targets: readonly BlobRow[];
	actions: WalletActions;
	signatures: number;
	onCancel: () => void;
	onDeleted: () => void;
}) {
	const client = useCurrentClient();
	const keep = useRef<HTMLButtonElement>(null);
	const [deleting, setDeleting] = useState<Deleting>({ kind: "idle" });
	const [digests, setDigests] = useState<readonly string[]>([]);
	useEffect(() => keep.current?.focus(), []);
	const batches = useMemo(
		() =>
			inBatches(
				targets.map((row) => row.blob.objectId),
				MAX_DELETES_PER_TRANSACTION,
			),
		[targets],
	);
	const simulation = useChainRead(
		`${network.id}:delete-many:${batches.flat().join(",")}`,
		async (signal) => {
			let netMist = 0n;
			for (const batch of batches) {
				const simulated = await simulateTransaction(
					client,
					buildDeleteManyTransaction(client, batch, actions.address),
					actions.address,
					signal,
				);
				netMist += simulated.netMist;
			}
			return netMist;
		},
	).read;

	async function confirm() {
		setDeleting({ kind: "signing" });
		const done: string[] = [...digests];
		try {
			for (const batch of batches.slice(done.length)) {
				const executed = await actions.executor.execute(
					buildDeleteManyTransaction(client, batch, actions.address),
				);
				done.push(executed.digest);
				setDigests([...done]);
			}
			setDeleting({ kind: "done" });
		} catch (error) {
			setDeleting({ kind: "failed", message: describeActionError(error) });
		} finally {
			if (done.length > digests.length) onDeleted();
		}
	}

	const links = digests.map((digest, index) => (
		<a
			key={digest}
			href={explorerTxUrl(network, digest)}
			target="_blank"
			rel="noopener noreferrer"
		>
			{digests.length === 1 ? "View transaction" : `Transaction ${index + 1}`}
		</a>
	));
	if (deleting.kind === "done")
		return (
			<p className="note" role="status">
				Deleted {targets.length === 1 ? "1 blob" : `${targets.length} blobs`}.
				Their Storage objects are back in your wallet. {links}
			</p>
		);

	return (
		<div className="panel danger-zone">
			<p>
				<b>
					Delete {targets.length === 1 ? "this blob" : "these blobs"} for good?
				</b>
			</p>
			<p className="note" role="status" aria-live="polite">
				{simulation.status === "ready" ? (
					simulation.data < 0n ? (
						<>
							Simulated against chain: the delete goes through and returns{" "}
							<TokenAmount raw={-simulation.data} context="detailed" /> SUI of
							storage rebate after the network fee.
						</>
					) : (
						<>
							Simulated against chain: the delete goes through, with a network
							fee of <TokenAmount raw={simulation.data} context="detailed" />{" "}
							SUI.
						</>
					)
				) : simulation.status === "error" ? (
					<span className="danger">
						Simulated against chain, the delete would fail:{" "}
						{describeActionError(simulation.error)}
					</span>
				) : (
					"Simulating the delete against chain…"
				)}
			</p>
			<div className="acts">
				<button
					className="btn solid sm"
					type="button"
					disabled={
						simulation.status !== "ready" || deleting.kind === "signing"
					}
					aria-busy={deleting.kind === "signing"}
					onClick={confirm}
				>
					{deleting.kind === "signing"
						? "Confirm in your wallet…"
						: `Delete for good · ${signatures} ${signatures === 1 ? "tx" : "txs"}`}
				</button>
				<button ref={keep} className="btn sm" type="button" onClick={onCancel}>
					Keep them
				</button>
			</div>
			{deleting.kind === "failed" ? (
				<p className="note warn" role="alert">
					{deleting.message} {links}
				</p>
			) : null}
		</div>
	);
}
