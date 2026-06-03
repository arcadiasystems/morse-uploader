import type { ReactElement } from "react";
import type { ProgressIndicatorProps } from "../types.js";

const DEFAULT_PHASE_LABELS: Record<string, string> = {
	encrypting: "Encrypting...",
	uploading: "Uploading...",
	submitting: "Submitting...",
	complete: "Complete",
};

/** Presentational phase readout with an aria-live region. Renders nothing when idle. */
export function ProgressIndicator(
	props: ProgressIndicatorProps,
): ReactElement | null {
	const { phase, status, labels, className } = props;
	if (phase === null) {
		return null;
	}
	const text = labels?.[phase] ?? DEFAULT_PHASE_LABELS[phase] ?? phase;
	return (
		<div
			className={className}
			data-mu="progress"
			data-status={status}
			data-phase={phase}
			role="status"
			aria-live="polite"
		>
			{text}
		</div>
	);
}
