import { type ReactElement, useId } from "react";
import type { WriteModeSettingsProps } from "../types.js";

const DEFAULT_LABELS = {
	direct: "Direct Walrus",
	publisher: "Custom publisher",
	publisherUrl: "Publisher URL",
};

/** Controlled write-mode chooser (direct vs custom publisher) with a URL field. */
export function WriteModeSettings(props: WriteModeSettingsProps): ReactElement {
	const {
		mode,
		onModeChange,
		publisherUrl,
		onPublisherUrlChange,
		disabled = false,
		className,
		labels,
	} = props;
	const text = { ...DEFAULT_LABELS, ...labels };
	const groupName = useId();

	return (
		<div
			className={className}
			data-mu="write-mode"
			role="radiogroup"
			aria-label="Write mode"
		>
			<label data-mu="write-mode-option">
				<input
					type="radio"
					name={groupName}
					checked={mode === "direct"}
					disabled={disabled}
					onChange={() => onModeChange("direct")}
				/>
				<span>{text.direct}</span>
			</label>
			<label data-mu="write-mode-option">
				<input
					type="radio"
					name={groupName}
					checked={mode === "publisher"}
					disabled={disabled}
					onChange={() => onModeChange("publisher")}
				/>
				<span>{text.publisher}</span>
			</label>
			{mode === "publisher" ? (
				<input
					type="url"
					aria-label={text.publisherUrl}
					placeholder={text.publisherUrl}
					value={publisherUrl}
					disabled={disabled}
					onChange={(event) => onPublisherUrlChange(event.target.value)}
					data-mu="publisher-url"
				/>
			) : null}
		</div>
	);
}
