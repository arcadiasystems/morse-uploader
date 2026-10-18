import {
	InconsistentBlobError,
	NoBlobMetadataReceivedError,
	NotEnoughSliversReceivedError,
} from "@mysten/walrus";
import { describe, expect, it } from "vitest";
import { nodeStatusText, verifyResult } from "./verify-result";

const AT = 1_792_320_000_000;
const bytes = (length: number) => ({
	ok: true as const,
	value: new Uint8Array(length),
});
const failed = (error: unknown) => ({ ok: false as const, error });

describe("verifyResult", () => {
	it("is a match when the rebuilt bytes have the recorded size", () => {
		const result = verifyResult({
			read: bytes(1200),
			status: {
				ok: true,
				value: {
					type: "deletable",
					initialCertifiedEpoch: 554,
					deletableCounts: {
						count_deletable_total: 1,
						count_deletable_certified: 1,
					},
				},
			},
			expectedSize: 1200n,
			checkedAtMs: AT,
		});
		expect(result).toEqual({
			kind: "match",
			checkedAtMs: AT,
			bytes: 1200,
			nodeStatus: { kind: "deletable", certifiedEpoch: 554 },
		});
	});

	it("keeps a match when the status quorum fails: the bytes were still checked", () => {
		const result = verifyResult({
			read: bytes(10),
			status: failed(new Error("no quorum")),
			expectedSize: 10n,
			checkedAtMs: AT,
		});
		expect(result.kind === "match" && result.nodeStatus).toBeNull();
	});

	it("is a mismatch when the SDK's recomputed blob id differs", () => {
		const result = verifyResult({
			read: failed(new InconsistentBlobError("bad")),
			status: failed(new Error("x")),
			expectedSize: 10n,
			checkedAtMs: AT,
		});
		expect(result.kind).toBe("mismatch");
	});

	it("is a mismatch when the size differs from the record on Sui", () => {
		const result = verifyResult({
			read: bytes(9),
			status: failed(new Error("x")),
			expectedSize: 10n,
			checkedAtMs: AT,
		});
		expect(result).toMatchObject({ kind: "mismatch" });
		expect(result.kind === "mismatch" && result.detail).toContain("9 bytes");
	});

	it("is unavailable when nodes do not return enough slivers or metadata", () => {
		for (const error of [
			new NotEnoughSliversReceivedError("few"),
			new NoBlobMetadataReceivedError("none"),
		])
			expect(
				verifyResult({
					read: failed(error),
					status: failed(error),
					expectedSize: 1n,
					checkedAtMs: AT,
				}).kind,
			).toBe("unavailable");
	});

	it("reports any other failure with its message", () => {
		const result = verifyResult({
			read: failed(new TypeError("Failed to fetch")),
			status: failed(new Error("x")),
			expectedSize: 1n,
			checkedAtMs: AT,
		});
		expect(result).toEqual({
			kind: "failed",
			checkedAtMs: AT,
			detail: "Failed to fetch",
		});
	});
});

describe("nodeStatusText", () => {
	it("never claims a number of storage nodes", () => {
		const texts = [
			nodeStatusText(null),
			nodeStatusText({ kind: "permanent", endEpoch: 606, certified: true }),
			nodeStatusText({ kind: "deletable", certifiedEpoch: 553 }),
			nodeStatusText({ kind: "unknown" }),
		];
		for (const text of texts) expect(text).not.toMatch(/\d+ (storage )?nodes/);
		expect(texts[1]).toBe(
			"A quorum of nodes reports it certified and stored until epoch 606.",
		);
	});
});
