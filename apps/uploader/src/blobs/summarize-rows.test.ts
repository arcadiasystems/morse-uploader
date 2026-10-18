import { describe, expect, it } from "vitest";
import { blobRow } from "./fixtures";
import { summarizeRows } from "./summarize-rows";

describe("summarizeRows", () => {
	it("counts every view, totals the size and finds the next expiry", () => {
		const soon = blobRow({ endEpoch: 556, size: 100n });
		const quilt = blobRow({ isQuilt: true, endEpoch: 603, size: 445_556n });
		const encrypted = blobRow({ isEncrypted: true, size: 9_000n });
		// Neither an expired nor a never-certified blob is "next to expire".
		const expired = blobRow({ endEpoch: 474, size: 1n });
		const registered = blobRow({ certifiedEpoch: null, endEpoch: 555 });
		const summary = summarizeRows([
			quilt,
			expired,
			soon,
			encrypted,
			registered,
		]);
		expect(summary.counts).toEqual({
			all: 5,
			quilts: 1,
			encrypted: 1,
			expiring: 1,
			expired: 1,
		});
		expect(summary.totalSize).toBe(445_556n + 100n + 9_000n + 1n + 1_000n);
		expect(summary.nextToExpire).toBe(soon);
	});

	it("is empty for a wallet without blobs", () => {
		expect(summarizeRows([])).toEqual({
			counts: { all: 0, quilts: 0, encrypted: 0, expiring: 0, expired: 0 },
			totalSize: 0n,
			nextToExpire: null,
		});
	});
});
