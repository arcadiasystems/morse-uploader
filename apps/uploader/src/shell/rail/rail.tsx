import type { BlobFilter } from "@/blobs/filter-rows";
import { Brand } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { type AppRoute, routeHash } from "../app-route";
import { ProfileMenu } from "../profile-menu/profile-menu";
import type { Popover } from "../use-popover";
import { MoreMenu } from "./more-menu";

interface RailProps {
	route: AppRoute;
	/** Transfers queued or under way; the rail item carries a dot while any are. */
	transfersActive: number;
	transfersPanel: Popover;
	profileMenu: Popover;
}

interface Destination {
	label: string;
	icon: IconName;
	route: AppRoute;
	/** Whether the item stands for where the app is. */
	isCurrent: (route: AppRoute) => boolean;
}

const filesWith =
	(...filters: readonly BlobFilter[]) =>
	(route: AppRoute) =>
		route.view === "files" && filters.includes(route.filter);

/** The views the rail goes to: the Overview, and Files with a filter. */
const DESTINATIONS: readonly Destination[] = [
	{
		label: "Overview",
		icon: "home",
		route: { view: "overview" },
		isCurrent: (route) => route.view === "overview",
	},
	{
		label: "Files",
		icon: "folder",
		route: { view: "files", filter: "all" },
		isCurrent: filesWith("all", "quilts", "encrypted"),
	},
	{
		label: "Expiry",
		icon: "clock",
		route: { view: "files", filter: "expiring" },
		isCurrent: filesWith("expiring"),
	},
	{
		label: "Shared",
		icon: "share",
		route: { view: "files", filter: "shared" },
		isCurrent: filesWith("shared"),
	},
	{
		label: "Morse",
		icon: "morse",
		route: { view: "files", filter: "published" },
		isCurrent: filesWith("published"),
	},
];

/**
 * The left rail: the mark, the views, the transfers panel, a planned feature
 * marked as coming, More, and the profile avatar with its menu. On phones it
 * becomes the bottom tab bar.
 */
export function Rail({
	route,
	transfersActive,
	transfersPanel,
	profileMenu,
}: RailProps) {
	const views = DESTINATIONS.slice(0, 2);
	const filters = DESTINATIONS.slice(2);
	const link = (destination: Destination) => {
		const current = destination.isCurrent(route);
		return (
			<a
				key={destination.label}
				className={current ? "ri on" : "ri"}
				href={routeHash(destination.route)}
				aria-label={destination.label}
				title={destination.label}
				aria-current={current ? "page" : undefined}
			>
				<Icon name={destination.icon} size={18} />
			</a>
		);
	};
	return (
		<nav className="rail" aria-label="Views">
			<span className="lg">
				<Brand wordmark={false} />
			</span>
			{views.map(link)}
			<button
				type="button"
				className="ri"
				aria-label={
					transfersActive > 0
						? `Transfers, ${transfersActive} in progress`
						: "Transfers"
				}
				title="Transfers"
				aria-haspopup="dialog"
				aria-expanded={transfersPanel.isOpen}
				aria-controls={transfersPanel.isOpen ? transfersPanel.id : undefined}
				onClick={transfersPanel.toggle}
			>
				<Icon name="transfers" size={18} />
				{transfersActive > 0 ? <i className="b" aria-hidden="true" /> : null}
			</button>
			{filters.map(link)}
			<button
				type="button"
				className="ri soon"
				disabled
				aria-label="Agents and keys (MCP), coming"
				title="Agents and keys (MCP), coming"
			>
				<Icon name="agent" size={18} />
				<span className="mark" aria-hidden="true">
					soon
				</span>
			</button>
			<span className="sp" />
			<MoreMenu />
			<ProfileMenu popover={profileMenu} />
		</nav>
	);
}
