import { describe, expect, it } from "vitest";
import { blobRow, TESTNET_CLOCK } from "./fixtures";
import { summarizeOverview } from "./overview-summary";

describe("summarizeOverview", () => {
	const plain = blobRow({
		size: 1_000n,
		encodedSize: 70_038_000n,
		endEpoch: 600,
	});
	const quilt = blobRow({
		isQuilt: true,
		size: 4_100_000n,
		encodedSize: 84_052_000n,
		endEpoch: 590,
	});
	const sealed = blobRow({
		isEncrypted: true,
		size: 411n,
		encodedSize: 66_034_000n,
		endEpoch: 556,
	});
	const soon = blobRow({ size: 9n, encodedSize: 66_034_000n, endEpoch: 555 });
	const registered = blobRow({
		certifiedEpoch: null,
		size: 50n,
		endEpoch: 557,
	});
	const expired = blobRow({ size: 91_000_000n, endEpoch: 474 });

	it("counts as stored only certified blobs whose storage has not ended", () => {
		const summary = summarizeOverview([
			plain,
			quilt,
			sealed,
			soon,
			registered,
			expired,
		]);
		expect(summary.stored).toEqual({
			blobs: 4,
			quilts: 1,
			encrypted: 1,
			size: 1_000n + 4_100_000n + 411n + 9n,
			encodedSize: 70_038_000n + 84_052_000n + 66_034_000n + 66_034_000n,
		});
		expect(summary.unfinished).toBe(1);
		expect(summary.expired).toBe(1);
	});

	it("lists the stored blobs ending within 30 days", () => {
		const summary = summarizeOverview([plain, sealed, soon, registered]);
		expect(summary.expiringSoon).toEqual([sealed, soon]);
	});

	it("names the first and last paid storage end among stored blobs", () => {
		const summary = summarizeOverview([
			plain,
			quilt,
			soon,
			registered,
			expired,
		]);
		expect(summary.firstEnd).toEqual({
			endEpoch: 555,
			expiresAtMs: TESTNET_CLOCK.epochStartMs + TESTNET_CLOCK.epochDurationMs,
			daysLeft: 0,
		});
		expect(summary.lastEnd?.endEpoch).toBe(600);
		expect(summary.lastEnd?.expiresAtMs).toBe(plain.status.expiresAtMs);
		expect(summary.lastEnd?.daysLeft).toBe(plain.status.daysLeft);
	});

	it("has no stored storage end when nothing is stored", () => {
		const summary = summarizeOverview([registered, expired]);
		expect(summary.stored.blobs).toBe(0);
		expect(summary.firstEnd).toBeNull();
		expect(summary.lastEnd).toBeNull();
		expect(summarizeOverview([])).toEqual({
			stored: { blobs: 0, quilts: 0, encrypted: 0, size: 0n, encodedSize: 0n },
			unfinished: 0,
			expired: 0,
			expiringSoon: [],
			firstEnd: null,
			lastEnd: null,
		});
	});
});
