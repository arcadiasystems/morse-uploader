import { Icon, type IconName } from "@/components/icon";
import type { NetworkConfig } from "@/network/networks";
import { BLOB_VIEWS, type BlobView } from "./blob-views";

interface SidebarProps {
	view: BlobView;
	onSelect: (view: BlobView) => void;
	network: NetworkConfig;
	connected: boolean;
}

const WALRUS_VIEWS: readonly BlobView[] = [
	"all",
	"quilts",
	"encrypted",
	"expiring",
];
const PUBLISHED_VIEWS: readonly BlobView[] = ["publications", "shared"];

/** Views of the Walrus pane, features that are coming, and the storage summary. */
export function Sidebar({ view, onSelect, network, connected }: SidebarProps) {
	const viewItem = (id: BlobView) => (
		<li key={id}>
			<button
				type="button"
				className={id === view ? "item on" : "item"}
				aria-current={id === view ? "true" : undefined}
				onClick={() => onSelect(id)}
			>
				<Icon name={BLOB_VIEWS[id].icon} />
				{BLOB_VIEWS[id].label}
			</button>
		</li>
	);

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
			<div className="storage">
				<b>Storage paid through</b>
				<div className="bar" aria-hidden="true">
					<i />
				</div>
				<small>
					{connected
						? "The blob that expires first shows here."
						: "Connect a wallet to see how long your storage is paid for."}
				</small>
				<small>
					Epochs last{" "}
					{network.epochDays === 1 ? "1 day" : `${network.epochDays} days`} on{" "}
					{network.label}. You can pay up to {network.maxEpochsAhead} epochs
					ahead.
				</small>
			</div>
		</aside>
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
