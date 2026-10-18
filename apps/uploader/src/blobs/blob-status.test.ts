import { describe, expect, it } from "vitest";
import { blobStatus, DAY_MS, EXPIRING_SOON_DAYS } from "./blob-status";
import {
	blobRecord,
	MAINNET_CLOCK,
	TESTNET_CLOCK,
	TESTNET_NOW,
} from "./fixtures";

const certified = (endEpoch: number) =>
	blobRecord({ certifiedEpoch: 553, startEpoch: 553, endEpoch });

describe("blobStatus on Testnet (1-day epochs)", () => {
	it("ends storage at the start of the end epoch", () => {
		const status = blobStatus(certified(556), TESTNET_CLOCK, TESTNET_NOW);
		expect(status.expiresAtMs).toBe(
			TESTNET_CLOCK.epochStartMs + 2 * TESTNET_CLOCK.epochDurationMs,
		);
		// 1.5 days left: whole days are floored.
		expect(status.daysLeft).toBe(1);
		expect(status.kind).toBe("expiring");
	});

	it("counts a blob expiring within 30 days, and certified beyond", () => {
		// 29.5 days left.
		expect(
			blobStatus(certified(584), TESTNET_CLOCK, TESTNET_NOW),
		).toMatchObject({
			kind: "expiring",
			daysLeft: 29,
		});
		// 30.5 days left.
		expect(
			blobStatus(certified(585), TESTNET_CLOCK, TESTNET_NOW),
		).toMatchObject({
			kind: "certified",
			daysLeft: 30,
		});
		expect(EXPIRING_SOON_DAYS).toBe(30);
	});

	it("is expired once the current epoch reaches the end epoch", () => {
		for (const endEpoch of [554, 456]) {
			expect(
				blobStatus(certified(endEpoch), TESTNET_CLOCK, TESTNET_NOW),
			).toMatchObject({ kind: "expired", daysLeft: 0, remaining: 0 });
		}
		const expired = blobStatus(certified(456), TESTNET_CLOCK, TESTNET_NOW);
		expect(expired.expiresAtMs).toBe(
			TESTNET_CLOCK.epochStartMs - 98 * TESTNET_CLOCK.epochDurationMs,
		);
	});

	it("shows a never-certified blob as registered until it expires", () => {
		expect(
			blobStatus(
				blobRecord({ certifiedEpoch: null, endEpoch: 555 }),
				TESTNET_CLOCK,
				TESTNET_NOW,
			).kind,
		).toBe("registered");
		expect(
			blobStatus(
				blobRecord({ certifiedEpoch: null, endEpoch: 503 }),
				TESTNET_CLOCK,
				TESTNET_NOW,
			).kind,
		).toBe("expired");
	});

	it("marks encrypted blobs, but expiry wins over encryption", () => {
		expect(
			blobStatus(
				blobRecord({ isEncrypted: true, endEpoch: 603 }),
				TESTNET_CLOCK,
				TESTNET_NOW,
			).kind,
		).toBe("encrypted");
		expect(
			blobStatus(
				blobRecord({ isEncrypted: true, endEpoch: 556 }),
				TESTNET_CLOCK,
				TESTNET_NOW,
			).kind,
		).toBe("expiring");
	});

	it("reports the share of the paid period still ahead", () => {
		// 50 paid epochs, 48.5 still ahead.
		expect(
			blobStatus(certified(603), TESTNET_CLOCK, TESTNET_NOW).remaining,
		).toBeCloseTo(48.5 / 50);
	});

	it("treats a late epoch change as under a day left, not negative", () => {
		const late = TESTNET_CLOCK.epochStartMs + 1.5 * DAY_MS;
		expect(blobStatus(certified(555), TESTNET_CLOCK, late)).toMatchObject({
			kind: "expiring",
			daysLeft: 0,
			remaining: 0,
		});
	});
});

describe("blobStatus on Walrus Mainnet (14-day epochs)", () => {
	const now = MAINNET_CLOCK.epochStartMs + 3 * DAY_MS;
	const mainnetBlob = (endEpoch: number) =>
		blobRecord({ certifiedEpoch: 30, startEpoch: 30, endEpoch });

	it("converts epochs left to days with the 14-day duration", () => {
		// Two epochs ahead, three days in: 25 days left.
		expect(blobStatus(mainnetBlob(43), MAINNET_CLOCK, now)).toMatchObject({
			kind: "expiring",
			daysLeft: 25,
		});
		// Three epochs ahead: 39 days left.
		expect(blobStatus(mainnetBlob(44), MAINNET_CLOCK, now)).toMatchObject({
			kind: "certified",
			daysLeft: 39,
		});
	});

	it("expires on Walrus Mainnet at the end epoch too", () => {
		expect(blobStatus(mainnetBlob(41), MAINNET_CLOCK, now).kind).toBe(
			"expired",
		);
	});
});
