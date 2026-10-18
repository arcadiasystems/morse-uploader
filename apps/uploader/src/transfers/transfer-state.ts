import type { NetworkId } from "@/network/networks";
import type { TransferRecord } from "./record-plan";
import type { TransferEstimate } from "./transfer-job";

/**
 * The transfer queue as a state machine. The reducer is pure: the engine
 * does the work and reports what happened as events.
 *
 * An item moves through its steps (PROTOCOL-NOTES section 6):
 * encode → register (signed) → upload → wait for the batch → certify (one
 * signature for the batch) → record (Morse transactions, when there are
 * any) → done. A step that fails either retries with backoff, waits for a
 * manual retry, or, when certify fails after the upload, offers Finish.
 */

export type TransferStep =
	| "encode"
	| "register"
	| "upload"
	| "certify"
	| "record";

/** The steps before the batch certify. */
const UPLOAD_STEPS: ReadonlySet<TransferStep> = new Set([
	"encode",
	"register",
	"upload",
]);

export type TransferStatus =
	/** Waiting to run, starting at `from`. */
	| { kind: "queued"; from: TransferStep }
	| {
			kind: "running";
			step: TransferStep;
			/** Bytes sent to the relay so far, during upload. */
			sentBytes: number;
			bytesPerSecond: number | null;
	  }
	/** Uploaded; certified together with the rest of its batch. */
	| { kind: "awaiting-certify" }
	| {
			kind: "retrying";
			step: TransferStep;
			/** The attempt that will run next, from 2. */
			attempt: number;
			retryAtMs: number;
			error: string;
	  }
	| {
			kind: "failed";
			step: TransferStep;
			error: string;
			/** Certify failed after the upload: Finish certifies from the saved state. */
			finishable: boolean;
			/** Whether the step can run again from what the app still holds. */
			retryable: boolean;
			/**
			 * The wallet opens in a window, which the browser allows only right
			 * after a click: the user presses Sign, and the step runs from that click.
			 */
			needsClick: boolean;
	  }
	| { kind: "done" };

export interface TransferItem {
	id: string;
	batchId: string;
	network: NetworkId;
	owner: string;
	/** The `name` attribute: a folder name for a quilt, a path for a blob. */
	name: string;
	kind: "blob" | "quilt";
	fileCount: number;
	/** Bytes the relay receives. */
	uploadBytes: number;
	encrypted: boolean;
	estimate: TransferEstimate;
	/** "record" is present only when there is a Morse transaction to make. */
	steps: readonly TransferStep[];
	/** Signatures the item asks for, the shared certify included. */
	transactions: number;
	/** Signatures given so far. */
	signed: number;
	status: TransferStatus;
	blobId: string | null;
	blobObjectId: string | null;
	registerDigest: string | null;
	/** `null` until certified, and when the certify was found on chain after a reload. */
	certifyDigest: string | null;
	records: readonly TransferRecord[];
	startedAtMs: number | null;
	finishedAtMs: number | null;
}

export interface TransferState {
	items: readonly TransferItem[];
	/** Pause all: a running item stops after its current step; queued ones wait. */
	paused: boolean;
	/** Something the queue could not do that is not one item's failure, such as saving for Finish. */
	notice: string | null;
	/** The last measured relay upload speed, in bytes per second; `null` before any. */
	throughput: number | null;
}

export type TransferEvent =
	| { type: "enqueued"; items: readonly TransferItem[] }
	/** Items saved after their upload, restored after a reload with Finish. */
	| { type: "restored"; items: readonly TransferItem[] }
	| { type: "started"; id: string; step: TransferStep; atMs: number }
	| {
			type: "progressed";
			id: string;
			sentBytes: number;
			bytesPerSecond: number | null;
	  }
	| { type: "encoded"; id: string; blobId: string }
	| { type: "registered"; id: string; blobObjectId: string; digest: string }
	| { type: "uploaded"; id: string }
	/** `digest` is `null` when the certify was found on chain rather than made here. */
	| {
			type: "certified";
			ids: readonly string[];
			digest: string | null;
			atMs: number;
	  }
	| { type: "recorded"; id: string; record: TransferRecord }
	| { type: "record-finished"; id: string; atMs: number }
	| {
			type: "failed";
			id: string;
			step: TransferStep;
			error: string;
			finishable: boolean;
			retryable: boolean;
			needsClick: boolean;
	  }
	| {
			type: "retry-scheduled";
			id: string;
			step: TransferStep;
			attempt: number;
			retryAtMs: number;
			error: string;
	  }
	/** A scheduled retry fell due, or the user pressed Retry or Finish. */
	| { type: "requeued"; id: string; from: TransferStep }
	/** The user dismissed a stopped item. */
	| { type: "dismissed"; id: string }
	| { type: "noticed"; notice: string | null }
	| { type: "paused" }
	| { type: "resumed" };

export const INITIAL_TRANSFER_STATE: TransferState = {
	items: [],
	paused: false,
	notice: null,
	throughput: null,
};

export function transferReducer(
	state: TransferState,
	event: TransferEvent,
): TransferState {
	switch (event.type) {
		case "enqueued":
			return { ...state, items: [...state.items, ...event.items] };
		case "restored": {
			const known = new Set(state.items.map((item) => item.id));
			const fresh = event.items.filter((item) => !known.has(item.id));
			return fresh.length === 0
				? state
				: { ...state, items: [...state.items, ...fresh] };
		}
		case "paused":
			return state.paused ? state : { ...state, paused: true };
		case "resumed":
			return state.paused ? { ...state, paused: false } : state;
		case "started":
			return update(state, event.id, (item) => ({
				...item,
				startedAtMs: item.startedAtMs ?? event.atMs,
				status: {
					kind: "running",
					step: event.step,
					sentBytes: 0,
					bytesPerSecond: null,
				},
			}));
		case "progressed": {
			const next = update(state, event.id, (item) =>
				item.status.kind === "running"
					? {
							...item,
							status: {
								...item.status,
								sentBytes: event.sentBytes,
								bytesPerSecond: event.bytesPerSecond,
							},
						}
					: item,
			);
			return event.bytesPerSecond === null
				? next
				: { ...next, throughput: event.bytesPerSecond };
		}
		case "encoded":
			return update(state, event.id, (item) => ({
				...item,
				blobId: event.blobId,
			}));
		case "registered":
			return update(state, event.id, (item) => ({
				...item,
				blobObjectId: event.blobObjectId,
				registerDigest: event.digest,
				signed: item.signed + 1,
			}));
		case "uploaded":
			return update(state, event.id, (item) => ({
				...item,
				status: { kind: "awaiting-certify" },
			}));
		case "certified": {
			const ids = new Set(event.ids);
			return {
				...state,
				items: state.items.map((item) => {
					if (!ids.has(item.id)) return item;
					const certified = {
						...item,
						certifyDigest: event.digest,
						signed: item.signed + 1,
					};
					return item.steps.includes("record")
						? { ...certified, status: { kind: "queued", from: "record" } }
						: {
								...certified,
								status: { kind: "done" },
								finishedAtMs: event.atMs,
							};
				}),
			};
		}
		case "recorded":
			return update(state, event.id, (item) => ({
				...item,
				records: [...item.records, event.record],
				signed: item.signed + 1,
			}));
		case "record-finished":
			return update(state, event.id, (item) => ({
				...item,
				status: { kind: "done" },
				finishedAtMs: event.atMs,
			}));
		case "failed":
			return update(state, event.id, (item) => ({
				...item,
				status: {
					kind: "failed",
					step: event.step,
					error: event.error,
					finishable: event.finishable,
					retryable: event.retryable,
					needsClick: event.needsClick,
				},
			}));
		case "retry-scheduled":
			return update(state, event.id, (item) => ({
				...item,
				status: {
					kind: "retrying",
					step: event.step,
					attempt: event.attempt,
					retryAtMs: event.retryAtMs,
					error: event.error,
				},
			}));
		case "dismissed":
			return {
				...state,
				items: state.items.filter((item) => item.id !== event.id),
			};
		case "noticed":
			return state.notice === event.notice
				? state
				: { ...state, notice: event.notice };
		case "requeued":
			return update(state, event.id, (item) => ({
				...item,
				status: { kind: "queued", from: event.from },
			}));
	}
}

function update(
	state: TransferState,
	id: string,
	change: (item: TransferItem) => TransferItem,
): TransferState {
	return {
		...state,
		items: state.items.map((item) => (item.id === id ? change(item) : item)),
	};
}

/** The next item to run: the first queued one, unless the queue is paused. */
export function nextQueued(state: TransferState): TransferItem | null {
	if (state.paused) return null;
	return state.items.find((item) => item.status.kind === "queued") ?? null;
}

/** Whether an item still has an upload step ahead of it or under way. */
function isBeforeCertify(item: TransferItem): boolean {
	const { status } = item;
	switch (status.kind) {
		case "queued":
			return UPLOAD_STEPS.has(status.from);
		case "running":
		case "retrying":
			return UPLOAD_STEPS.has(status.step);
		default:
			return false;
	}
}

/**
 * The items to certify together in one transaction: the uploaded items of
 * a batch, once none of the batch is still on its way there. Items that
 * failed do not hold the batch back. Empty while any item still uploads.
 */
export function certifyGroup(state: TransferState): TransferItem[] {
	const waiting = state.items.filter(
		(item) => item.status.kind === "awaiting-certify",
	);
	const batchId = waiting[0]?.batchId;
	if (batchId === undefined) return [];
	const batch = state.items.filter((item) => item.batchId === batchId);
	if (batch.some(isBeforeCertify)) return [];
	return waiting.filter((item) => item.batchId === batchId);
}

export type TransferTab = "queue" | "done" | "failed";

export function tabOf(item: TransferItem): TransferTab {
	switch (item.status.kind) {
		case "done":
			return "done";
		case "failed":
			return "failed";
		default:
			return "queue";
	}
}

/** Share of each step in an item's progress bar; the upload dominates. */
const STEP_WEIGHT: Readonly<Record<TransferStep, number>> = {
	encode: 1,
	register: 1,
	upload: 6,
	certify: 1,
	record: 1,
};

/** How far along an item is, from 0 to 1, for its progress bar. */
export function itemProgress(item: TransferItem): number {
	const { status, steps } = item;
	if (status.kind === "done") return 1;
	const total = steps.reduce((sum, step) => sum + STEP_WEIGHT[step], 0);
	const current: TransferStep | null =
		status.kind === "queued"
			? status.from
			: status.kind === "running" ||
					status.kind === "retrying" ||
					status.kind === "failed"
				? status.step
				: "certify";
	const index = steps.indexOf(current);
	const before = steps
		.slice(0, Math.max(0, index))
		.reduce((sum, step) => sum + STEP_WEIGHT[step], 0);
	const within =
		status.kind === "running" &&
		status.step === "upload" &&
		item.uploadBytes > 0
			? (STEP_WEIGHT.upload * Math.min(status.sentBytes, item.uploadBytes)) /
				item.uploadBytes
			: 0;
	return (before + within) / total;
}

/** Where each step stands for an item, for its step chips. */
export type StepState = "done" | "now" | "failed" | "retrying" | "pending";

export function stepStates(
	item: TransferItem,
): { step: TransferStep; state: StepState }[] {
	const { status, steps } = item;
	const current: TransferStep | null =
		status.kind === "done"
			? null
			: status.kind === "queued"
				? status.from
				: status.kind === "awaiting-certify"
					? "certify"
					: status.step;
	const currentIndex = current === null ? steps.length : steps.indexOf(current);
	return steps.map((step, index) => {
		if (index < currentIndex) return { step, state: "done" };
		if (index > currentIndex) return { step, state: "pending" };
		switch (status.kind) {
			case "failed":
				return { step, state: "failed" };
			case "retrying":
				return { step, state: "retrying" };
			case "running":
			case "awaiting-certify":
				return { step, state: "now" };
			default:
				return { step, state: "pending" };
		}
	});
}
