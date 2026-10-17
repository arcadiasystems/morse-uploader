import { Icon } from "@/components/icon";

/** List or grid view. Disabled while the pane has no items to lay out. */
export function ViewToggle() {
	return (
		<fieldset className="view" disabled>
			<legend className="sr-only">View</legend>
			<button
				className="on"
				type="button"
				aria-pressed="true"
				aria-label="List view"
			>
				<Icon name="list" size={14} />
			</button>
			<button type="button" aria-pressed="false" aria-label="Grid view">
				<Icon name="grid" size={14} />
			</button>
		</fieldset>
	);
}
