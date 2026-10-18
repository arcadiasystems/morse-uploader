import { describe, expect, it } from "vitest";
import { summarizeTransfers } from "./summarize-transfers";
import {
	INITIAL_TRANSFER_STATE,
	type TransferItem,
	type TransferState,
	type TransferStatus,
} from "./transfer-state";

function item(
	id: string,
	status: TransferStatus,
	overrides: Partial<TransferItem> = {},
): TransferItem {
	return {
		id,
		batchId: "batch-1",
		network: "testnet",
		owner: "0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75",
		name: `${id}.txt`,
		kind: "blob",
		fileCount: 1,
		uploadBytes: 10_000,
		encrypted: false,
		estimate: { walFrost: 465_696n, suiMist: 7_000_000n },
		steps: ["encode", "register", "upload", "certify"],
		transactions: 2,
		signed: 0,
		status,
		blobId: null,
		blobObjectId: null,
		registerDigest: null,
		certifyDigest: null,
		records: [],
		startedAtMs: null,
		finishedAtMs: null,
		...overrides,
	};
}

function state(items: readonly TransferItem[], paused = false): TransferState {
	return { ...INITIAL_TRANSFER_STATE, items, paused };
}

const running = (
	step: "encode" | "register" | "upload" | "certify" | "record",
	sentBytes = 0,
	bytesPerSecond: number | null = null,
): TransferStatus => ({ kind: "running", step, sentBytes, bytesPerSecond });

const failed: TransferStatus = {
	kind: "failed",
	step: "certify",
	error: "The wallet closed.",
	finishable: true,
	retryable: true,
	needsClick: false,
};

describe("summarizeTransfers", () => {
	it("is idle with nothing queued", () => {
		expect(summarizeTransfers(INITIAL_TRANSFER_STATE)).toEqual({
			active: 0,
			failed: 0,
			done: 0,
			progress: 0,
			now: { kind: "idle" },
		});
	});

	it("counts what stopped and what finished, apart from what is active", () => {
		const summary = summarizeTransfers(
			state([
				item("a", { kind: "done" }),
				item("b", failed),
				item("c", { kind: "queued", from: "encode" }),
			]),
		);
		expect(summary).toMatchObject({ active: 1, failed: 1, done: 1 });
	});

	it("stays idle when only stopped and finished items remain", () => {
		const summary = summarizeTransfers(
			state([item("a", { kind: "done" }), item("b", failed)]),
		);
		expect(summary.active).toBe(0);
		expect(summary.now).toEqual({ kind: "idle" });
	});

	it("says paused while Pause all holds the queue", () => {
		const summary = summarizeTransfers(
			state([item("a", running("upload", 10, 100))], true),
		);
		expect(summary.now).toEqual({ kind: "paused" });
	});

	it("says signing at every step the wallet signs", () => {
		for (const step of ["register", "certify", "record"] as const)
			expect(summarizeTransfers(state([item("a", running(step))])).now).toEqual(
				{ kind: "signing" },
			);
	});

	it("estimates seconds left on the current upload from its speed", () => {
		const uploading = item("a", running("upload", 4_000, 1_500));
		// 6,000 bytes left at 1,500 bytes a second.
		expect(summarizeTransfers(state([uploading])).now).toEqual({
			kind: "uploading",
			secondsLeft: 4,
		});
		const starting = item("b", running("upload", 0, null));
		expect(summarizeTransfers(state([starting])).now).toEqual({
			kind: "uploading",
			secondsLeft: null,
		});
	});

	it("puts a signature before an upload, and an upload before a retry", () => {
		const retrying = item("r", {
			kind: "retrying",
			step: "upload",
			attempt: 2,
			retryAtMs: 5_000,
			error: "relay timeout",
		});
		expect(
			summarizeTransfers(
				state([
					retrying,
					item("u", running("upload", 1, 10)),
					item("s", running("register")),
				]),
			).now.kind,
		).toBe("signing");
		expect(
			summarizeTransfers(state([retrying, item("u", running("upload", 1, 10))]))
				.now.kind,
		).toBe("uploading");
		expect(summarizeTransfers(state([retrying])).now).toEqual({
			kind: "retrying",
		});
	});

	it("says working while encoding or waiting for the batch to certify", () => {
		expect(
			summarizeTransfers(state([item("a", running("encode"))])).now,
		).toEqual({ kind: "working" });
		expect(
			summarizeTransfers(state([item("a", { kind: "awaiting-certify" })])).now,
		).toEqual({ kind: "working" });
	});

	it("measures progress over the latest batch only", () => {
		const summary = summarizeTransfers(
			state([
				item("old", { kind: "queued", from: "encode" }, { batchId: "batch-0" }),
				item("a", { kind: "done" }, { batchId: "batch-2" }),
				item("b", { kind: "queued", from: "encode" }, { batchId: "batch-2" }),
			]),
		);
		// One item done and one not started: halfway.
		expect(summary.progress).toBe(0.5);
	});
});
