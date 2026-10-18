import { describe, expect, it } from "vitest";
import {
	formatAgo,
	formatDays,
	formatModified,
	formatShortDate,
} from "./format-date";

// Noon UTC keeps the calendar day the same in every time zone from UTC-11 to UTC+11.
const noon = (year: number, month: number, day: number) =>
	Date.UTC(year, month - 1, day, 12);

describe("formatShortDate", () => {
	it("writes day and month in the current year, as the design does", () => {
		expect(formatShortDate(noon(2026, 10, 3), noon(2026, 10, 18))).toBe(
			"3 Oct",
		);
		expect(formatShortDate(noon(2026, 12, 5), noon(2026, 10, 18))).toBe(
			"5 Dec",
		);
	});

	it("adds the year when it differs", () => {
		expect(formatShortDate(noon(2025, 7, 1), noon(2026, 10, 18))).toBe(
			"1 Jul 2025",
		);
		expect(formatShortDate(noon(2028, 10, 17), noon(2026, 10, 18))).toBe(
			"17 Oct 2028",
		);
	});
});

describe("formatDays", () => {
	it("writes whole days, and under a day as such", () => {
		expect(formatDays(0)).toBe("< 1 day");
		expect(formatDays(1)).toBe("1 day");
		expect(formatDays(23)).toBe("23 days");
	});
});

describe("formatModified", () => {
	it("says today and yesterday, then a short date", () => {
		const now = noon(2026, 10, 18);
		expect(formatModified(noon(2026, 10, 18) - 3_600_000, now)).toBe("today");
		expect(formatModified(noon(2026, 10, 17), now)).toBe("yesterday");
		expect(formatModified(noon(2026, 10, 2), now)).toBe("2 Oct");
	});
});

describe("formatAgo", () => {
	const now = noon(2026, 10, 18);
	it("says how long ago a check ran", () => {
		expect(formatAgo(now - 20_000, now)).toBe("just now");
		expect(formatAgo(now - 60_000, now)).toBe("1 minute ago");
		expect(formatAgo(now - 2 * 60_000, now)).toBe("2 minutes ago");
		expect(formatAgo(now - 3_600_000, now)).toBe("1 hour ago");
		expect(formatAgo(now - 5 * 3_600_000, now)).toBe("5 hours ago");
		expect(formatAgo(now - 2 * 86_400_000, now)).toBe("2 days ago");
	});

	it("treats a moment in the future as now", () => {
		expect(formatAgo(now + 5_000, now)).toBe("just now");
	});
});
