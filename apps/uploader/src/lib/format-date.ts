const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

/**
 * A date as the design writes it, `3 Oct`, with the year added when it is not
 * the year of `nowMs`: `3 Oct 2025`. In the viewer's time zone.
 */
export function formatShortDate(ms: number, nowMs: number): string {
	const sameYear = new Date(ms).getFullYear() === new Date(nowMs).getFullYear();
	return (sameYear ? DAY_MONTH : DAY_MONTH_YEAR).format(ms);
}

/** Whole days as a short duration: `< 1 day`, `1 day`, `23 days`. */
export function formatDays(days: number): string {
	if (days < 1) return "< 1 day";
	return days === 1 ? "1 day" : `${days} days`;
}
