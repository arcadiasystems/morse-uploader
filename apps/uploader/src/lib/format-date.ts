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

/**
 * A file's modified time as the design's local pane shows it: `today`,
 * `yesterday`, otherwise a short date. Days are the viewer's calendar days.
 */
export function formatModified(ms: number, nowMs: number): string {
	const day = (value: number) => {
		const date = new Date(value);
		return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
	};
	const daysAgo = Math.round((day(nowMs) - day(ms)) / 86_400_000);
	if (daysAgo === 0) return "today";
	if (daysAgo === 1) return "yesterday";
	return formatShortDate(ms, nowMs);
}
