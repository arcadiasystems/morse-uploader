import { Brand } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { type AppRoute, type FileFilter, routeHash } from "../app-route";
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

/** Files filters the rail jumps to, and the filters each item lights up for. */
const DESTINATIONS: readonly {
	label: string;
	icon: IconName;
	filter: FileFilter;
	on: readonly FileFilter[];
}[] = [
	{
		label: "Files",
		icon: "folder",
		filter: "all",
		on: ["all", "quilts", "encrypted"],
	},
	{ label: "Expiry", icon: "clock", filter: "expiring", on: ["expiring"] },
	{ label: "Shared", icon: "share", filter: "shared", on: ["shared"] },
	{ label: "Morse", icon: "morse", filter: "published", on: ["published"] },
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
	const [files, ...filters] = DESTINATIONS;
	const link = (destination: (typeof DESTINATIONS)[number]) => {
		const current = destination.on.includes(route.filter);
		return (
			<a
				key={destination.label}
				className={current ? "ri on" : "ri"}
				href={routeHash({ filter: destination.filter })}
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
			{files ? link(files) : null}
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
