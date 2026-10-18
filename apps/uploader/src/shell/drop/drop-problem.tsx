import { Icon } from "@/components/icon";

/** Why a drop gave nothing to stage, until the user dismisses it. */
export function DropProblem({
	message,
	onDismiss,
}: {
	message: string;
	onDismiss: () => void;
}) {
	return (
		<div className="drop-problem" role="alert">
			<span>{message}</span>
			<button
				className="x"
				type="button"
				aria-label="Dismiss"
				onClick={onDismiss}
			>
				<Icon name="close" size={14} />
			</button>
		</div>
	);
}
