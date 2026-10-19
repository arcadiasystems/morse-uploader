import { certifyTransactions } from "@/upload/upload-cost";
import {
	type StepState,
	stepStates,
	type TransferItem,
	type TransferState,
	type TransferStep,
	tabOf,
} from "./transfer-state";

/**
 * How the transfers slide-over (design/v2/app-transfers.html) shows the
 * queue: five segments per item, its action when it stopped, and the
 * summary strip. Pure, so the countdowns and counts are tested.
 */

/**
 * The five steps every row shows. The design draws four segments (encode,
 * upload, certify, record); the register signature sits between encode
 * and upload, so it has its own (PROTOCOL-NOTES section 6, section 13 item 9).
 */
export const PIPELINE = [
	"encode",
	"register",
	"upload",
	"certify",
	"record",
] as const satisfies readonly TransferStep[];

/** `skipped`: the item has no Morse transaction, so it has no record step. */
export type SegmentState = StepState | "skipped";

export interface Segment {
	step: TransferStep;
	state: SegmentState;
	/** How much of a running upload is sent, from 0 to 1; `null` for other steps. */
	fill: number | null;
}

export function stepSegments(item: TransferItem): Segment[] {
	const states = new Map(
		stepStates(item).map(({ step, state }) => [step, state]),
	);
	const { status } = item;
	return PIPELINE.map((step) => ({
		step,
		state: states.get(step) ?? "skipped",
		fill:
			step === "upload" &&
			status.kind === "running" &&
			status.step === "upload" &&
			item.uploadBytes > 0
				? Math.min(1, status.sentBytes / item.uploadBytes)
				: null,
	}));
}

/** Whole seconds until a retry is due, counting down to 0. */
export function retryCountdown(retryAtMs: number, nowMs: number): number {
	return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
}

/**
 * Whether Finish is offered: certify failed after the upload, and the
 * queue still holds the saved upload and the blob object it certifies
 * (the handover's build notes, PROTOCOL-NOTES section 6).
 */
export function finishAvailable(item: TransferItem): boolean {
	const { status } = item;
	return (
		status.kind === "failed" &&
		status.step === "certify" &&
		status.finishable &&
		status.retryable &&
		item.blobObjectId !== null
	);
}

/** What a row offers when its item stopped or waits to retry. */
export type ItemAction =
	/** An automatic retry is due in `seconds`; Retry now runs it at once. */
	| { kind: "retry-now"; seconds: number; attempt: number }
	/** Certify failed after the upload: Finish certifies the saved upload. */
	| { kind: "finish" }
	/** The browser blocked the wallet window: Sign runs the step from a click. */
	| { kind: "sign" }
	| { kind: "retry" }
	/** Nothing can run it again (its files are gone): only Dismiss is left. */
	| { kind: "none" };

/** `null` while the item runs, waits or is done. */
export function itemAction(
	item: TransferItem,
	nowMs: number,
): ItemAction | null {
	const { status } = item;
	if (status.kind === "retrying")
		return {
			kind: "retry-now",
			seconds: retryCountdown(status.retryAtMs, nowMs),
			attempt: status.attempt,
		};
	if (status.kind !== "failed") return null;
	if (!status.retryable) return { kind: "none" };
	if (status.needsClick) return { kind: "sign" };
	if (finishAvailable(item)) return { kind: "finish" };
	return { kind: "retry" };
}

/**
 * Signatures a batch asks for and has given: one register per item, one
 * certify per hundred items, and each Morse transaction. A Finish after a
 * failed certify signs a certify of its own, so the count can grow.
 */
export function batchSignatures(items: readonly TransferItem[]): {
	signed: number;
	total: number;
} {
	const registers = items.filter((item) => item.registerDigest !== null).length;
	const certifies = new Set(
		items.flatMap((item) =>
			item.certifyDigest === null ? [] : [item.certifyDigest],
		),
	).size;
	const records = items.reduce((sum, item) => sum + item.records.length, 0);
	const planned =
		items.length +
		certifyTransactions(items.length) +
		items.reduce((sum, item) => sum + Math.max(0, item.transactions - 2), 0);
	const signed = registers + certifies + records;
	return { signed, total: Math.max(planned, signed) };
}

/** The slide-over's summary strip: remaining, throughput, cost and signatures. */
export interface TransfersStrip {
	/** Seconds of uploading left at the measured speed; `null` when no speed is measured yet. */
	remainingSeconds: number | null;
	/** The last measured relay upload speed, in bytes per second. */
	throughput: number | null;
	/** The latest batch: what it was quoted and its signatures; `null` with no transfers. */
	batch: {
		walFrost: bigint;
		/** `null` when gas could not be estimated for every item. */
		suiMist: bigint | null;
		signed: number;
		total: number;
	} | null;
}

export function transfersStrip(state: TransferState): TransfersStrip {
	const bytesLeft = state.items
		.filter((item) => tabOf(item) === "queue")
		.reduce((sum, item) => sum + bytesLeftOf(item), 0);
	const { throughput } = state;
	const latest = state.items.at(-1);
	const batch = latest
		? state.items.filter((item) => item.batchId === latest.batchId)
		: [];
	return {
		remainingSeconds:
			bytesLeft === 0
				? 0
				: throughput !== null && throughput > 0
					? Math.ceil(bytesLeft / throughput)
					: null,
		throughput,
		batch:
			batch.length === 0
				? null
				: {
						walFrost: batch.reduce(
							(sum, item) => sum + item.estimate.walFrost,
							0n,
						),
						suiMist: batch.every((item) => item.estimate.suiMist !== null)
							? batch.reduce(
									(sum, item) => sum + (item.estimate.suiMist ?? 0n),
									0n,
								)
							: null,
						...batchSignatures(batch),
					},
	};
}

/** Bytes an active item still has to send: all of them until its upload, the rest during it. */
function bytesLeftOf(item: TransferItem): number {
	const { status } = item;
	switch (status.kind) {
		case "queued":
			return sendsBytes(status.from) ? item.uploadBytes : 0;
		case "retrying":
			return sendsBytes(status.step) ? item.uploadBytes : 0;
		case "running":
			if (status.step === "upload")
				return Math.max(0, item.uploadBytes - status.sentBytes);
			return sendsBytes(status.step) ? item.uploadBytes : 0;
		default:
			return 0;
	}
}

/** Steps that still have the whole upload ahead of them, or under way. */
function sendsBytes(step: TransferStep): boolean {
	return step === "encode" || step === "register" || step === "upload";
}

/** A duration as the strip and the pill show it: `48 s`, `3 min 20 s`, `1 h 5 min`. */
export function formatDuration(seconds: number): string {
	const whole = Math.max(0, Math.round(seconds));
	if (whole < 60) return `${whole} s`;
	const minutes = Math.floor(whole / 60);
	if (minutes < 60) {
		const rest = whole % 60;
		return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
