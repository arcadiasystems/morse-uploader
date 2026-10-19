import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useEffect, useRef, useState } from "react";
import type { BlobRecord } from "@/blobs/blob-record";
import { TokenAmount } from "@/components/token-amount";
import { useChainRead } from "@/lib/use-chain-read";
import { describeActionError } from "@/manage/action-error";
import {
	buildDeleteTransaction,
	simulateTransaction,
} from "@/manage/blob-transactions";
import { type DeleteBlocker, deleteBlockerText } from "@/manage/delete-rules";
import { explorerTxUrl } from "@/network/explorer-urls";
import type { NetworkConfig } from "@/network/networks";
import type { WalletActions } from "@/wallet/use-wallet-actions";

/**
 * Delete (PROTOCOL-NOTES section 8 and section 13, item 16), only for a
 * deletable blob whose storage has not ended. It takes two steps in the
 * page: the first simulates the delete against chain and says what it
 * does, the second signs it. No WAL comes back: the blob's Storage object
 * returns to the wallet, and copies others keep are not removed.
 */
export function DeleteSection({
	network,
	blob,
	blocker,
	quiltFile,
	actions,
	onDeleted,
}: {
	network: NetworkConfig;
	blob: Pick<BlobRecord, "objectId" | "isQuilt">;
	blocker: DeleteBlocker | null;
	/** Set for a file in a quilt, which is deleted only with its quilt. */
	quiltFile: boolean;
	actions: WalletActions | null;
	onDeleted: () => void;
}) {
	const [open, setOpen] = useState(false);
	const opener = useRef<HTMLButtonElement>(null);
	const returnFocus = useRef(false);
	// Keep it closes the confirm step; focus goes back to the delete button.
	useEffect(() => {
		if (!open && returnFocus.current) {
			returnFocus.current = false;
			opener.current?.focus();
		}
	}, [open]);
	const reason = quiltFile
		? "A file in a quilt is deleted with its quilt. Select the quilt to delete it."
		: blocker
			? deleteBlockerText(blocker)
			: null;
	const label = blob.isQuilt
		? "Delete quilt · returns its storage to your wallet"
		: "Delete blob · returns its storage to your wallet";

	return (
		<section className="sec" aria-label="Delete">
			{reason !== null || actions === null ? (
				<>
					<div className="acts">
						<button className="btn sm danger" type="button" disabled>
							{label}
						</button>
					</div>
					<p className="note">
						{reason ?? "Connect the wallet that owns this blob to delete it."}
					</p>
				</>
			) : open ? (
				<ConfirmDelete
					network={network}
					objectId={blob.objectId}
					actions={actions}
					onCancel={() => {
						returnFocus.current = true;
						setOpen(false);
					}}
					onDeleted={onDeleted}
				/>
			) : (
				<div className="acts">
					<button
						ref={opener}
						className="btn sm danger"
						type="button"
						onClick={() => setOpen(true)}
					>
						{label}
					</button>
				</div>
			)}
		</section>
	);
}

type Signing =
	| { kind: "idle" }
	| { kind: "signing" }
	| { kind: "failed"; message: string }
	| { kind: "done"; digest: string };

/**
 * The second step: the simulated outcome, what delete does and does not do,
 * and the button that signs it.
 */
function ConfirmDelete({
	network,
	objectId,
	actions,
	onCancel,
	onDeleted,
}: {
	network: NetworkConfig;
	objectId: string;
	actions: WalletActions;
	onCancel: () => void;
	onDeleted: () => void;
}) {
	const client = useCurrentClient();
	const [signing, setSigning] = useState<Signing>({ kind: "idle" });
	const keep = useRef<HTMLButtonElement>(null);
	// The button that opened this step is gone; focus moves to the safe choice.
	useEffect(() => keep.current?.focus(), []);
	const simulation = useChainRead(
		`${network.id}:delete:${objectId}`,
		(signal) =>
			simulateTransaction(
				client,
				buildDeleteTransaction(client, objectId, actions.address),
				actions.address,
				signal,
			),
	).read;

	async function confirm() {
		setSigning({ kind: "signing" });
		try {
			const executed = await actions.executor.execute(
				buildDeleteTransaction(client, objectId, actions.address),
			);
			setSigning({ kind: "done", digest: executed.digest });
			onDeleted();
		} catch (error) {
			setSigning({ kind: "failed", message: describeActionError(error) });
		}
	}

	if (signing.kind === "done")
		return (
			<p className="note ok" role="status">
				Deleted. Its Storage object is back in your wallet.{" "}
				<a
					href={explorerTxUrl(network, signing.digest)}
					target="_blank"
					rel="noopener noreferrer"
				>
					View transaction
				</a>
			</p>
		);

	return (
		<div className="panel danger-zone">
			<p>
				<b>Delete this blob?</b> Its storage returns to your wallet as a Storage
				object that a later upload of the same size or smaller, for the same
				period, can reuse. No WAL is refunded. Copies other people keep, caches
				and past storage nodes' slivers are not removed.
			</p>
			<p className="note" role="status" aria-live="polite">
				{simulation.status === "ready" ? (
					simulation.data.netMist < 0n ? (
						<>
							Simulated against chain: the delete goes through and returns{" "}
							<TokenAmount raw={-simulation.data.netMist} context="detailed" />{" "}
							SUI of storage rebate after the network fee.
						</>
					) : (
						<>
							Simulated against chain: the delete goes through, with a network
							fee of{" "}
							<TokenAmount raw={simulation.data.netMist} context="detailed" />{" "}
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
					disabled={simulation.status !== "ready" || signing.kind === "signing"}
					aria-busy={signing.kind === "signing"}
					onClick={confirm}
				>
					{signing.kind === "signing"
						? "Confirm in your wallet…"
						: "Delete for good · 1 tx"}
				</button>
				<button ref={keep} className="btn sm" type="button" onClick={onCancel}>
					Keep it
				</button>
			</div>
			{signing.kind === "failed" ? (
				<p className="note warn" role="alert">
					{signing.message}
				</p>
			) : null}
		</div>
	);
}
