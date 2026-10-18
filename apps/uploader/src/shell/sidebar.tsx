import type { ReactNode } from "react";
import type { ListedBlobs } from "@/blobs/list-blobs";
import { Icon, type IconName } from "@/components/icon";
import { formatBytes } from "@/lib/format-bytes";
import { formatDays } from "@/lib/format-date";
import type { NetworkConfig } from "@/network/networks";
import { BLOB_VIEWS, type BlobView } from "./blob-views";

interface SidebarProps {
	view: BlobView;
	onSelect: (view: BlobView) => void;
	network: NetworkConfig;
	connected: boolean;
	/** The wallet's blobs, once read. */
	listed: ListedBlobs | null;
}

const WALRUS_VIEWS: readonly BlobView[] = [
	"all",
	"quilts",
	"encrypted",
	"expiring",
	"expired",
];
const PUBLISHED_VIEWS: readonly BlobView[] = ["publications", "shared"];

/** Views of the Walrus pane with their counts, features that are coming, and the storage summary. */
export function Sidebar({
	view,
	onSelect,
	network,
	connected,
	listed,
}: SidebarProps) {
	const viewItem = (id: BlobView) => {
		const { filter, icon, label } = BLOB_VIEWS[id];
		const count = listed && filter ? listed.summary.counts[filter] : null;
		return (
			<li key={id}>
				<button
					type="button"
					className={id === view ? "item on" : "item"}
					aria-current={id === view ? "true" : undefined}
					onClick={() => onSelect(id)}
				>
					<Icon name={icon} />
					{label}
					{count === null ? null : <span className="n">{count}</span>}
				</button>
			</li>
		);
	};

	return (
		<aside className="side" aria-label="Sidebar">
			<nav aria-labelledby="side-walrus">
				<h4 id="side-walrus">Walrus</h4>
				<ul>{WALRUS_VIEWS.map(viewItem)}</ul>
			</nav>
			<nav aria-labelledby="side-published">
				<h4 id="side-published">Published</h4>
				<ul>
					{PUBLISHED_VIEWS.map(viewItem)}
					<ComingItem icon="globe" label="Walrus Sites deploy" />
				</ul>
			</nav>
			<section aria-labelledby="side-access">
				<h4 id="side-access">Access</h4>
				<ul>
					<ComingItem icon="agent" label="Agents and keys (MCP)" />
				</ul>
			</section>
			<section aria-labelledby="side-desktop">
				<h4 id="side-desktop">Desktop app</h4>
				<ul>
					<ComingItem icon="desktop" label="Download for Mac" />
					<ComingItem icon="batch" label="One-signature batch register" />
				</ul>
			</section>
			<StorageCard network={network} connected={connected} listed={listed} />
		</aside>
	);
}

/**
 * When the first paid storage ends. The bar measures that against the
 * longest period anyone can pay for: 53 epochs ahead of now.
 */
function StorageCard({
	network,
	connected,
	listed,
}: {
	network: NetworkConfig;
	connected: boolean;
	listed: ListedBlobs | null;
}) {
	const next = listed?.summary.nextToExpire ?? null;
	const horizonMs = listed
		? network.maxEpochsAhead * listed.clock.epochDurationMs
		: 0;
	const share =
		next && listed && horizonMs > 0
			? Math.min(
					1,
					Math.max(0, next.status.expiresAtMs - listed.nowMs) / horizonMs,
				)
			: 0;

	return (
		<div className="storage">
			<b>Storage paid through</b>
			<div
				className="bar"
				aria-hidden="true"
				title={`Next expiry against the longest period you can pay for, ${network.maxEpochsAhead} epochs`}
			>
				<i style={{ width: `${(share * 100).toFixed(1)}%` }} />
			</div>
			<small>{firstExpiryLine(connected, listed)}</small>
			{listed && listed.rows.length > 0 ? (
				<small>
					{formatBytes(listed.summary.totalSize)} across{" "}
					{listed.rows.length === 1 ? "1 blob" : `${listed.rows.length} blobs`}
				</small>
			) : null}
			<small>
				Epochs last{" "}
				{network.epochDays === 1 ? "1 day" : `${network.epochDays} days`} on{" "}
				{network.label}. You can pay up to {network.maxEpochsAhead} epochs
				ahead.
			</small>
		</div>
	);
}

function firstExpiryLine(
	connected: boolean,
	listed: ListedBlobs | null,
): ReactNode {
	if (listed === null) {
		return connected
			? "The blob that expires first shows here."
			: "Connect a wallet to see how long your storage is paid for.";
	}
	const next = listed.summary.nextToExpire;
	if (next === null) return "No certified blob is paid for right now.";
	return (
		<>
			Next blob expires in <b>{formatDays(next.status.daysLeft)}</b>
		</>
	);
}

/** A feature that is planned but not built: visibly disabled and marked Coming. */
function ComingItem({ icon, label }: { icon: IconName; label: string }) {
	return (
		<li>
			<button type="button" className="item soon" disabled>
				<Icon name={icon} />
				{label}
				<span className="chip soon">Coming</span>
			</button>
		</li>
	);
}
