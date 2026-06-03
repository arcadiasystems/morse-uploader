import type { ReactElement } from "react";
import type { EncryptToggleProps } from "../types.js";

/** Controlled encrypt checkbox. Presentational; native checkbox for a11y. */
export function EncryptToggle(props: EncryptToggleProps): ReactElement {
	const {
		checked,
		onChange,
		disabled = false,
		label = "Encrypt",
		className,
	} = props;
	return (
		<label className={className} data-mu="encrypt-toggle">
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span>{label}</span>
		</label>
	);
}
