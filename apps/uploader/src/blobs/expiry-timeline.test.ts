import { describe, expect, it } from "vitest";
import { expiryTimeline, TIMELINE_MONTHS } from "./expiry-timeline";
import { blobRow, MAINNET_CLOCK, TESTNET_NOW } from "./fixtures";

// Every end epoch below starts mid-month (dates in the comments are UTC),
// so the calendar month is the same in any time zone from UTC-11 to UTC+11.
// TESTNET_NOW is 18 Oct 2026, so the first month is October 2026.
const certified = (endEpoch: number) => blobRow({ endEpoch });

describe("expiryTimeline", () => {
	it("shows the next 12 calendar months from the current one", () => {
		const { months } = expiryTimeline([], TESTNET_NOW);
		expect(months).toHaveLength(TIMELINE_MONTHS);
		const first = new Date(months[0]?.startMs ?? 0);
		expect([first.getFullYear(), first.getMonth(), first.getDate()]).toEqual([
			2026, 9, 1,
		]);
		const last = new Date(months.at(-1)?.startMs ?? 0);
		expect([last.getFullYear(), last.getMonth()]).toEqual([2027, 8]);
	});

	it("places each blob in the month its end epoch starts, split by state", () => {
		const timeline = expiryTimeline(
			[
				certified(556), // 19 Oct, 1.5 days left: ends soon
				blobRow({ certifiedEpoch: null, endEpoch: 556 }), // never certified
				certified(584), // 16 Nov, 29.5 days left: still within 30 days
				certified(585), // 17 Nov, 30.5 days left: later
				certified(614), // 16 Dec
				certified(884), // 12 Sep 2027, the last month shown
			],
			TESTNET_NOW,
		);
		const [october, november, december] = timeline.months;
		expect(october).toMatchObject({
			unfinished: 1,
			soon: 1,
			later: 0,
			total: 2,
		});
		expect(november).toMatchObject({
			unfinished: 0,
			soon: 1,
			later: 1,
			total: 2,
		});
		expect(december).toMatchObject({ soon: 0, later: 1, total: 1 });
		expect(timeline.months[11]).toMatchObject({ later: 1, total: 1 });
		expect(
			timeline.months.slice(3, 11).every((month) => month.total === 0),
		).toBe(true);
		expect(timeline.beyond).toBe(0);
		expect(timeline.peak).toBe(2);
	});

	it("leaves out expired blobs and counts what ends after the last month", () => {
		const timeline = expiryTimeline(
			[
				certified(474), // expired in July
				certified(954), // 21 Nov 2027, past September 2027
				certified(556),
			],
			TESTNET_NOW,
		);
		expect(timeline.months.reduce((sum, month) => sum + month.total, 0)).toBe(
			1,
		);
		expect(timeline.beyond).toBe(1);
		expect(timeline.peak).toBe(1);
	});

	it("spreads Walrus Mainnet's 14-day epochs over the months", () => {
		// 7 Oct 2026, a day into epoch 41.
		const nowMs = MAINNET_CLOCK.epochStartMs + 86_400_000;
		const mainnet = (endEpoch: number) =>
			blobRow({ startEpoch: 40, endEpoch }, MAINNET_CLOCK, nowMs);
		const timeline = expiryTimeline(
			[
				mainnet(42), // 20 Oct, 13 days left
				mainnet(44), // 17 Nov, 41 days left
				mainnet(47), // 29 Dec
				mainnet(65), // 7 Sep 2027
				mainnet(68), // 19 Oct 2027, past the window
			],
			nowMs,
		);
		const totals = timeline.months.map((month) => month.total);
		expect(totals).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
		expect(timeline.months[0]).toMatchObject({ soon: 1, later: 0 });
		expect(timeline.months[1]).toMatchObject({ soon: 0, later: 1 });
		expect(timeline.beyond).toBe(1);
	});

	it("is empty, with no peak, for a wallet with no blobs", () => {
		const timeline = expiryTimeline([], TESTNET_NOW);
		expect(timeline.months.every((month) => month.total === 0)).toBe(true);
		expect(timeline.beyond).toBe(0);
		expect(timeline.peak).toBe(0);
	});
});
