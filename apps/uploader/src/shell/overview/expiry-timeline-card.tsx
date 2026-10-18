import { useMemo } from "react";
import { expiryTimeline, type TimelineMonth } from "@/blobs/expiry-timeline";
import type { ListedBlobs } from "@/blobs/list-blobs";
import type { NetworkConfig } from "@/network/networks";

// en-US abbreviates every month to three letters, as the design labels them.
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
	month: "long",
	year: "numeric",
});

/**
 * When the wallet's storage runs out, month by month for the next 12, from
 * each blob's end epoch and the epoch length. A bar's height is its blob
 * count against the busiest month.
 */
export function ExpiryTimelineCard({
	network,
	listed,
}: {
	network: NetworkConfig;
	listed: ListedBlobs | null;
}) {
	const timeline = useMemo(
		() => (listed ? expiryTimeline(listed.rows, listed.nowMs) : null),
		[listed],
	);
	const epoch = network.epochDays === 1 ? "1 day" : `${network.epochDays} days`;
	return (
		<div className="card span-8">
			<h4 id="timeline-title">Expiry timeline · next 12 months</h4>
			{timeline ? (
				<div className="strip">
					<ol className="bars" aria-labelledby="timeline-title">
						{timeline.months.map((month) => (
							<Bar key={month.startMs} month={month} peak={timeline.peak} />
						))}
					</ol>
					<div className="months" aria-hidden="true">
						{timeline.months.map((month) => (
							<span key={month.startMs}>{MONTH.format(month.startMs)}</span>
						))}
					</div>
				</div>
			) : (
				<div className="strip skel" aria-busy="true" />
			)}
			<p className="legend">
				<span className="key red" aria-hidden="true" /> not certified{" "}
				<span className="key amber" aria-hidden="true" /> ends within 30 days{" "}
				<span className="key grey" aria-hidden="true" /> later
			</p>
			<p className="fine">
				{timeline && timeline.beyond > 0
					? `${timeline.beyond} more ${timeline.beyond === 1 ? "ends" : "end"} after ${MONTH_YEAR.format(timeline.months.at(-1)?.startMs ?? 0)}. `
					: ""}
				Epochs last {epoch} on {network.label}, and storage can be paid at most{" "}
				{network.maxEpochsAhead} epochs ahead. Dates are estimates from the
				epoch length.
			</p>
		</div>
	);
}

function Bar({ month, peak }: { month: TimelineMonth; peak: number }) {
	const share = (value: number) =>
		peak === 0 ? "0%" : `${((value / peak) * 100).toFixed(1)}%`;
	const label = MONTH_YEAR.format(month.startMs);
	const date = new Date(month.startMs);
	return (
		<li
			data-month={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`}
			data-total={month.total}
			data-soon={month.soon}
			data-later={month.later}
			data-unfinished={month.unfinished}
			title={`${label}: ${month.total} ${month.total === 1 ? "blob ends" : "blobs end"}`}
		>
			<span className="sr-only">
				{label}: {month.total} {month.total === 1 ? "blob ends" : "blobs end"}
				{month.soon > 0 ? `, ${month.soon} within 30 days` : ""}
				{month.unfinished > 0 ? `, ${month.unfinished} not certified` : ""}
			</span>
			{month.later > 0 ? (
				<i className="grey" style={{ height: share(month.later) }} />
			) : null}
			{month.soon > 0 ? (
				<i className="amber" style={{ height: share(month.soon) }} />
			) : null}
			{month.unfinished > 0 ? (
				<i className="red" style={{ height: share(month.unfinished) }} />
			) : null}
		</li>
	);
}
