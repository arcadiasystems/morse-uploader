import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";

interface EmptyStateProps {
	icon: IconName;
	title: string;
	children: ReactNode;
	action?: ReactNode;
}

/** The designed empty state for a pane: an icon tile, a title, one line, an optional action. */
export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
	return (
		<div className="empty">
			<span className="tile">
				<Icon name={icon} size={20} />
			</span>
			<b>{title}</b>
			<p>{children}</p>
			{action}
		</div>
	);
}
