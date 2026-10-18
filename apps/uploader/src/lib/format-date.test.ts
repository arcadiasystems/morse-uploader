import { describe, expect, it } from "vitest";
import { formatDays, formatShortDate } from "./format-date";

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
