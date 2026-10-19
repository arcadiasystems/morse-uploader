import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, retryDelayMs } from "./retry-policy";
import {
	INITIAL_TRANSFER_STATE,
	type TransferItem,
	type TransferState,
	type TransferStatus,
	transferReducer,
} from "./transfer-state";
import {
	batchSignatures,
	finishAvailable,
	formatDuration,
	itemAction,
	PIPELINE,
	retryCountdown,
	stepSegments,
	transfersStrip,
} from "./transfer-view";

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

const running = (
	step: "encode" | "register" | "upload" | "certify" | "record",
	sentBytes = 0,
	bytesPerSecond: number | null = null,
): TransferStatus => ({ kind: "running", step, sentBytes, bytesPerSecond });

const certifyFailed: TransferStatus = {
	kind: "failed",
	step: "certify",
	error: "The certify transaction was not sent.",
	finishable: true,
	retryable: true,
	needsClick: false,
};

const WITH_RECORD = {
	steps: ["encode", "register", "upload", "certify", "record"] as const,
	transactions: 3,
};

const states = (target: TransferItem) =>
	stepSegments(target).map((segment) => segment.state);

describe("the five-step progress", () => {
	it("always shows encode, register, upload, certify and record, register included (notes item 9)", () => {
		expect(PIPELINE).toEqual([
			"encode",
			"register",
			"upload",
			"certify",
			"record",
		]);
		expect(
			stepSegments(item("a", { kind: "queued", from: "encode" })).map(
				(segment) => segment.step,
			),
		).toEqual(PIPELINE);
	});

	it("marks the record step skipped for an item with no Morse transaction", () => {
		expect(states(item("a", { kind: "queued", from: "encode" }))).toEqual([
			"pending",
			"pending",
			"pending",
			"pending",
			"skipped",
		]);
		expect(states(item("a", { kind: "done" }))).toEqual([
			"done",
			"done",
			"done",
			"done",
			"skipped",
		]);
	});

	it("follows an item with a record step through every status", () => {
		const at = (status: TransferStatus) =>
			states(item("a", status, WITH_RECORD));
		expect(at(running("encode"))).toEqual([
			"now",
			"pending",
			"pending",
			"pending",
			"pending",
		]);
		expect(at(running("register"))).toEqual([
			"done",
			"now",
			"pending",
			"pending",
			"pending",
		]);
		expect(at(running("upload", 4_000))).toEqual([
			"done",
			"done",
			"now",
			"pending",
			"pending",
		]);
		expect(at({ kind: "awaiting-certify" })).toEqual([
			"done",
			"done",
			"done",
			"now",
			"pending",
		]);
		expect(at(certifyFailed)).toEqual([
			"done",
			"done",
			"done",
			"failed",
			"pending",
		]);
		expect(at({ kind: "queued", from: "record" })).toEqual([
			"done",
			"done",
			"done",
			"done",
			"pending",
		]);
		expect(at(running("record"))).toEqual([
			"done",
			"done",
			"done",
			"done",
			"now",
		]);
		expect(at({ kind: "done" })).toEqual([
			"done",
			"done",
			"done",
			"done",
			"done",
		]);
	});

	it("shows an automatic retry on the step it retries", () => {
		const retrying: TransferStatus = {
			kind: "retrying",
			step: "upload",
			attempt: 2,
			retryAtMs: 10_000,
			error: "The upload relay timed out.",
		};
		expect(states(item("a", retrying))).toEqual([
			"done",
			"done",
			"retrying",
			"pending",
			"skipped",
		]);
	});

	it("fills the upload segment with the share of bytes sent", () => {
		const fills = stepSegments(item("a", running("upload", 2_500))).map(
			(segment) => segment.fill,
		);
		expect(fills).toEqual([null, null, 0.25, null, null]);
	});
});

describe("the retry countdown", () => {
	it("counts whole seconds down to the retry and stops at zero", () => {
		const retryAtMs = 50_000 + retryDelayMs(2);
		expect(retryCountdown(retryAtMs, 50_000)).toBe(2);
		expect(retryCountdown(retryAtMs, 50_001)).toBe(2);
		expect(retryCountdown(retryAtMs, 51_000)).toBe(1);
		expect(retryCountdown(retryAtMs, 51_999)).toBe(1);
		expect(retryCountdown(retryAtMs, 52_000)).toBe(0);
		expect(retryCountdown(retryAtMs, 60_000)).toBe(0);
	});

	it("offers Retry now with the attempt and the seconds left", () => {
		const retryAtMs = 1_000 + retryDelayMs(3);
		const retrying = item("a", {
			kind: "retrying",
			step: "upload",
			attempt: 3,
			retryAtMs,
			error: "The upload relay timed out.",
		});
		expect(itemAction(retrying, 1_000)).toEqual({
			kind: "retry-now",
			seconds: 4,
			attempt: MAX_ATTEMPTS,
		});
		expect(itemAction(retrying, 4_500)).toEqual({
			kind: "retry-now",
			seconds: 1,
			attempt: 3,
		});
	});
});

describe("Finish", () => {
	const objectId =
		"0x6c8cdc23b5a1f2e4d7c9b0a3f6e8d1c2b4a5f7e9d0c3b6a8f1e2d4c7b9a0f4c4f";

	it("is offered when certify failed after the upload and the blob object is known", () => {
		const stopped = item("a", certifyFailed, { blobObjectId: objectId });
		expect(finishAvailable(stopped)).toBe(true);
		expect(itemAction(stopped, 0)).toEqual({ kind: "finish" });
	});

	it("is not offered before the blob object exists, for other steps, or once nothing can retry", () => {
		expect(finishAvailable(item("a", certifyFailed))).toBe(false);
		expect(
			finishAvailable(
				item(
					"a",
					{ ...certifyFailed, step: "upload", finishable: false },
					{ blobObjectId: objectId },
				),
			),
		).toBe(false);
		const lost = item(
			"a",
			{ ...certifyFailed, retryable: false },
			{ blobObjectId: objectId },
		);
		expect(finishAvailable(lost)).toBe(false);
		expect(itemAction(lost, 0)).toEqual({ kind: "none" });
	});

	it("gives way to Sign when the browser blocked the wallet window", () => {
		const blocked = item(
			"a",
			{ ...certifyFailed, needsClick: true },
			{ blobObjectId: objectId },
		);
		expect(itemAction(blocked, 0)).toEqual({ kind: "sign" });
	});

	it("has no action while an item runs or once it is done", () => {
		expect(itemAction(item("a", running("upload")), 0)).toBeNull();
		expect(itemAction(item("a", { kind: "done" }), 0)).toBeNull();
	});
});

describe("batchSignatures", () => {
	it("plans one register per item, one certify for the batch and each Morse transaction", () => {
		const batch = [
			item("a", { kind: "queued", from: "encode" }),
			item("b", { kind: "queued", from: "encode" }, WITH_RECORD),
		];
		expect(batchSignatures(batch)).toEqual({ signed: 0, total: 4 });
	});

	it("counts the shared certify once and each record given", () => {
		const batch = [
			item(
				"a",
				{ kind: "done" },
				{ registerDigest: "R1", certifyDigest: "C1" },
			),
			item(
				"b",
				{ kind: "running", step: "record", sentBytes: 0, bytesPerSecond: null },
				{
					...WITH_RECORD,
					registerDigest: "R2",
					certifyDigest: "C1",
					records: [{ kind: "entry", entryId: 4, name: "b.txt", digest: "E1" }],
				},
			),
		];
		expect(batchSignatures(batch)).toEqual({ signed: 4, total: 4 });
	});

	it("grows when a Finish signs a certify of its own", () => {
		const batch = [
			item(
				"a",
				{ kind: "done" },
				{ registerDigest: "R1", certifyDigest: "C1" },
			),
			item(
				"b",
				{ kind: "done" },
				{ registerDigest: "R2", certifyDigest: "C2" },
			),
		];
		expect(batchSignatures(batch)).toEqual({ signed: 4, total: 4 });
		expect(batchSignatures(batch.slice(0, 1))).toEqual({ signed: 2, total: 2 });
	});
});

describe("transfersStrip", () => {
	const at = (
		items: readonly TransferItem[],
		throughput: number | null,
	): TransferState => ({
		...INITIAL_TRANSFER_STATE,
		items,
		throughput,
	});

	it("estimates the time left from every active item's bytes at the measured speed", () => {
		const strip = transfersStrip(
			at(
				[
					item("a", running("upload", 4_000, 1_000)),
					item("b", { kind: "queued", from: "encode" }),
					item("c", { kind: "done" }),
				],
				1_000,
			),
		);
		// 6,000 bytes left of a, all 10,000 of b, at 1,000 bytes a second.
		expect(strip.remainingSeconds).toBe(16);
		expect(strip.throughput).toBe(1_000);
		expect(strip.batch).toMatchObject({
			walFrost: 3n * 465_696n,
			suiMist: 21_000_000n,
			signed: 0,
			total: 4,
		});
	});

	it("says nothing is left once the bytes are sent, and unknown before any speed is measured", () => {
		expect(
			transfersStrip(at([item("a", { kind: "awaiting-certify" })], null))
				.remainingSeconds,
		).toBe(0);
		expect(
			transfersStrip(at([item("a", running("encode"))], null)).remainingSeconds,
		).toBeNull();
		expect(transfersStrip(INITIAL_TRANSFER_STATE)).toEqual({
			remainingSeconds: 0,
			throughput: null,
			batch: null,
		});
	});

	it("keeps the last measured speed in the queue after the upload ends", () => {
		const queued = transferReducer(INITIAL_TRANSFER_STATE, {
			type: "enqueued",
			items: [item("a", running("upload"))],
		});
		const measured = transferReducer(queued, {
			type: "progressed",
			id: "a",
			sentBytes: 5_000,
			bytesPerSecond: 2_500,
		});
		const unmeasured = transferReducer(measured, {
			type: "progressed",
			id: "a",
			sentBytes: 6_000,
			bytesPerSecond: null,
		});
		expect(unmeasured.throughput).toBe(2_500);
		const uploaded = transferReducer(unmeasured, { type: "uploaded", id: "a" });
		expect(transfersStrip(uploaded).throughput).toBe(2_500);
	});

	it("leaves the SUI estimate out unless every item has one", () => {
		const strip = transfersStrip(
			at(
				[
					item("a", { kind: "done" }),
					item(
						"b",
						{ kind: "done" },
						{ estimate: { walFrost: 1n, suiMist: null } },
					),
				],
				null,
			),
		);
		expect(strip.batch?.suiMist).toBeNull();
	});
});

describe("formatDuration", () => {
	it("writes seconds, minutes and hours as the strip shows them", () => {
		expect(formatDuration(48)).toBe("48 s");
		expect(formatDuration(200)).toBe("3 min 20 s");
		expect(formatDuration(180)).toBe("3 min");
		expect(formatDuration(3_900)).toBe("1 h 5 min");
		expect(formatDuration(-2)).toBe("0 s");
	});
});
