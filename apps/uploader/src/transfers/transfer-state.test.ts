import { describe, expect, it } from "vitest";
import {
	certifyGroup,
	INITIAL_TRANSFER_STATE,
	itemProgress,
	nextQueued,
	stepStates,
	type TransferEvent,
	type TransferItem,
	type TransferState,
	tabOf,
	transferReducer,
} from "./transfer-state";

function item(id: string, overrides: Partial<TransferItem> = {}): TransferItem {
	return {
		id,
		batchId: "batch-1",
		network: "testnet",
		owner: "0x4ea7c836fe1c4ac1a40a54a41622e1e60bd7dcc22188ba1e50a7c469b9ae4c75",
		name: `${id}.txt`,
		kind: "blob",
		fileCount: 1,
		uploadBytes: 1000,
		encrypted: false,
		estimate: { walFrost: 465_696n, suiMist: 7_000_000n },
		steps: ["encode", "register", "upload", "certify"],
		transactions: 2,
		signed: 0,
		status: { kind: "queued", from: "encode" },
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

function run(
	events: readonly TransferEvent[],
	state = INITIAL_TRANSFER_STATE,
): TransferState {
	return events.reduce(transferReducer, state);
}

function byId(state: TransferState, id: string): TransferItem {
	const found = state.items.find((candidate) => candidate.id === id);
	if (!found) throw new Error(`No item ${id}`);
	return found;
}

/** An item through encode, register and upload. */
function uploaded(id: string): TransferEvent[] {
	return [
		{ type: "started", id, step: "encode", atMs: 1 },
		{ type: "encoded", id, blobId: `blob-${id}` },
		{ type: "started", id, step: "register", atMs: 2 },
		{
			type: "registered",
			id,
			blobObjectId: `0x${id}`,
			digest: `register-${id}`,
		},
		{ type: "started", id, step: "upload", atMs: 3 },
		{ type: "uploaded", id },
	];
}

describe("transferReducer", () => {
	it("walks an item through its steps to done, counting signatures", () => {
		const state = run([
			{ type: "enqueued", items: [item("a")] },
			...uploaded("a"),
			{ type: "certified", ids: ["a"], digest: "certify-1", atMs: 10 },
		]);
		const done = byId(state, "a");
		expect(done.status).toEqual({ kind: "done" });
		expect(done.blobId).toBe("blob-a");
		expect(done.blobObjectId).toBe("0xa");
		expect(done.signed).toBe(2);
		expect(done.startedAtMs).toBe(1);
		expect(done.finishedAtMs).toBe(10);
		expect(tabOf(done)).toBe("done");
	});

	it("shows the blob id as soon as the item is encoded", () => {
		const state = run([
			{ type: "enqueued", items: [item("a")] },
			{ type: "started", id: "a", step: "encode", atMs: 1 },
			{ type: "encoded", id: "a", blobId: "blob-a" },
		]);
		expect(byId(state, "a").blobId).toBe("blob-a");
	});

	it("queues the record step after certify when there are Morse transactions", () => {
		const state = run([
			{
				type: "enqueued",
				items: [
					item("a", {
						steps: ["encode", "register", "upload", "certify", "record"],
						transactions: 3,
					}),
				],
			},
			...uploaded("a"),
			{ type: "certified", ids: ["a"], digest: "certify-1", atMs: 10 },
		]);
		expect(byId(state, "a").status).toEqual({ kind: "queued", from: "record" });
		const recorded = run(
			[
				{ type: "started", id: "a", step: "record", atMs: 11 },
				{
					type: "recorded",
					id: "a",
					record: {
						kind: "entry",
						entryId: 7,
						name: "a.txt",
						digest: "entry-1",
					},
				},
				{ type: "record-finished", id: "a", atMs: 12 },
			],
			state,
		);
		expect(byId(recorded, "a")).toMatchObject({
			status: { kind: "done" },
			signed: 3,
			finishedAtMs: 12,
		});
	});

	it("retries an upload with backoff, then runs it again from the same step", () => {
		const state = run([
			{ type: "enqueued", items: [item("a")] },
			{ type: "started", id: "a", step: "upload", atMs: 1 },
			{
				type: "retry-scheduled",
				id: "a",
				step: "upload",
				attempt: 2,
				retryAtMs: 2001,
				error: "The upload relay timed out.",
			},
		]);
		expect(byId(state, "a").status).toEqual({
			kind: "retrying",
			step: "upload",
			attempt: 2,
			retryAtMs: 2001,
			error: "The upload relay timed out.",
		});
		expect(tabOf(byId(state, "a"))).toBe("queue");
		const requeued = run(
			[{ type: "requeued", id: "a", from: "upload" }],
			state,
		);
		expect(byId(requeued, "a").status).toEqual({
			kind: "queued",
			from: "upload",
		});
	});

	it("offers Finish when certify fails after the upload, and Finish certifies from there", () => {
		const failed = run([
			{ type: "enqueued", items: [item("a")] },
			...uploaded("a"),
			{ type: "started", id: "a", step: "certify", atMs: 4 },
			{
				type: "failed",
				id: "a",
				step: "certify",
				error: "Network error",
				finishable: true,
				retryable: true,
				needsClick: false,
			},
		]);
		const stopped = byId(failed, "a");
		expect(stopped.status).toMatchObject({
			kind: "failed",
			step: "certify",
			finishable: true,
		});
		expect(stopped.blobObjectId).toBe("0xa");
		expect(tabOf(stopped)).toBe("failed");
		expect(stepStates(stopped).map(({ state }) => state)).toEqual([
			"done",
			"done",
			"done",
			"failed",
		]);

		const finished = run(
			[
				{ type: "requeued", id: "a", from: "certify" },
				{ type: "started", id: "a", step: "certify", atMs: 20 },
				{ type: "certified", ids: ["a"], digest: "certify-2", atMs: 21 },
			],
			failed,
		);
		expect(byId(finished, "a")).toMatchObject({
			status: { kind: "done" },
			certifyDigest: "certify-2",
		});
	});

	it("restores saved items once, after a reload", () => {
		const saved = item("a", {
			status: {
				kind: "failed",
				step: "certify",
				error: "Stopped",
				finishable: true,
				retryable: true,
				needsClick: false,
			},
		});
		const once = run([{ type: "restored", items: [saved] }]);
		const twice = run([{ type: "restored", items: [saved] }], once);
		expect(twice.items).toHaveLength(1);
		expect(twice).toBe(once);
	});

	it("pauses and resumes the queue", () => {
		const paused = run([
			{ type: "enqueued", items: [item("a")] },
			{ type: "paused" },
		]);
		expect(paused.paused).toBe(true);
		expect(nextQueued(paused)).toBeNull();
		const resumed = run([{ type: "resumed" }], paused);
		expect(nextQueued(resumed)?.id).toBe("a");
	});
});

describe("certifyGroup", () => {
	it("waits until every item of the batch has uploaded, then certifies them together", () => {
		const twoUploading = run([
			{ type: "enqueued", items: [item("a"), item("b")] },
			...uploaded("a"),
		]);
		expect(certifyGroup(twoUploading)).toEqual([]);
		const both = run(uploaded("b"), twoUploading);
		expect(certifyGroup(both).map((ready) => ready.id)).toEqual(["a", "b"]);
	});

	it("does not wait for an item that failed", () => {
		const state = run([
			{ type: "enqueued", items: [item("a"), item("b")] },
			...uploaded("a"),
			{ type: "started", id: "b", step: "register", atMs: 5 },
			{
				type: "failed",
				id: "b",
				step: "register",
				error: "You declined the request in your wallet.",
				finishable: false,
				retryable: true,
				needsClick: false,
			},
		]);
		expect(certifyGroup(state).map((ready) => ready.id)).toEqual(["a"]);
	});

	it("waits for a retry under way", () => {
		const state = run([
			{ type: "enqueued", items: [item("a"), item("b")] },
			...uploaded("a"),
			{
				type: "retry-scheduled",
				id: "b",
				step: "upload",
				attempt: 2,
				retryAtMs: 9,
				error: "timeout",
			},
		]);
		expect(certifyGroup(state)).toEqual([]);
	});

	it("keeps batches apart", () => {
		const state = run([
			{
				type: "enqueued",
				items: [item("a"), item("b", { batchId: "batch-2" })],
			},
			...uploaded("a"),
			...uploaded("b"),
		]);
		expect(certifyGroup(state).map((ready) => ready.id)).toEqual(["a"]);
	});
});

describe("itemProgress", () => {
	it("weighs the upload by the bytes sent", () => {
		const state = run([
			{ type: "enqueued", items: [item("a")] },
			{ type: "started", id: "a", step: "upload", atMs: 1 },
			{ type: "progressed", id: "a", sentBytes: 500, bytesPerSecond: 1000 },
		]);
		// encode 1 + register 1 + half of upload 6, out of 9.
		expect(itemProgress(byId(state, "a"))).toBeCloseTo(5 / 9);
	});

	it("is full when done and empty when queued", () => {
		expect(itemProgress(item("a"))).toBe(0);
		expect(itemProgress(item("a", { status: { kind: "done" } }))).toBe(1);
	});
});
