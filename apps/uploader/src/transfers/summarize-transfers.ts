import {
	itemProgress,
	type TransferItem,
	type TransferState,
	tabOf,
} from "./transfer-state";

/**
 * What the queue is doing now, for the top bar's transfers pill:
 *
 * - `idle`: nothing is queued or running.
 * - `paused`: Pause all holds the queue between steps.
 * - `signing`: an item is at a step the wallet signs (register, certify or
 *   record), waiting for the signature or for the transaction it sent.
 * - `retrying`: an item failed a step and retries on its own shortly.
 * - `uploading`: an item is sending bytes to the relay; `secondsLeft` comes
 *   from the measured speed, `null` until the first bytes are timed.
 * - `working`: encoding, or waiting for the rest of the batch to certify.
 */
export type TransfersNow =
	| { kind: "idle" }
	| { kind: "paused" }
	| { kind: "signing" }
	| { kind: "retrying" }
	| { kind: "uploading"; secondsLeft: number | null }
	| { kind: "working" };

export interface TransfersSummary {
	/** Items queued or under way. */
	active: number;
	failed: number;
	done: number;
	/** How far the latest batch is, from 0 to 1; 0 when there is none. */
	progress: number;
	now: TransfersNow;
}

const WALLET_STEPS = new Set(["register", "certify", "record"]);

export function summarizeTransfers(state: TransferState): TransfersSummary {
	const active = state.items.filter((item) => tabOf(item) === "queue");
	const count = (test: (item: TransferItem) => boolean) =>
		state.items.filter(test).length;
	const latest = state.items.at(-1);
	const batch = latest
		? state.items.filter((item) => item.batchId === latest.batchId)
		: [];
	const progress =
		batch.length === 0
			? 0
			: batch.reduce((sum, item) => sum + itemProgress(item), 0) / batch.length;
	return {
		active: active.length,
		failed: count((item) => item.status.kind === "failed"),
		done: count((item) => item.status.kind === "done"),
		progress,
		now: transfersNow(active, state.paused),
	};
}

function transfersNow(
	active: readonly TransferItem[],
	paused: boolean,
): TransfersNow {
	if (active.length === 0) return { kind: "idle" };
	if (paused) return { kind: "paused" };
	for (const { status } of active) {
		if (status.kind === "running" && WALLET_STEPS.has(status.step))
			return { kind: "signing" };
	}
	for (const item of active) {
		const { status } = item;
		if (status.kind !== "running" || status.step !== "upload") continue;
		if (status.bytesPerSecond === null || status.bytesPerSecond <= 0)
			return { kind: "uploading", secondsLeft: null };
		const left = Math.max(0, item.uploadBytes - status.sentBytes);
		return {
			kind: "uploading",
			secondsLeft: Math.ceil(left / status.bytesPerSecond),
		};
	}
	if (active.some((item) => item.status.kind === "retrying"))
		return { kind: "retrying" };
	return { kind: "working" };
}
