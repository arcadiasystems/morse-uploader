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

/** How long ago a moment was, for "checked 2 minutes ago": `just now`, minutes, hours, then days. */
export function formatAgo(ms: number, nowMs: number): string {
	const minutes = Math.floor(Math.max(0, nowMs - ms) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60)
		return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? "1 day ago" : `${days} days ago`;
}
