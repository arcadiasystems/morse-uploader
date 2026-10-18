import { type ReactNode, useId } from "react";

interface SwitchRowProps {
	title: string;
	children: ReactNode;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
	/** Extra content under the description, such as a picker. */
	extra?: ReactNode;
	tone?: "paper" | "bone";
}

/** The design's toggle row: a title and a line of description, with a switch on the right. */
export function SwitchRow({
	title,
	children,
	checked,
	disabled = false,
	onChange,
	extra,
	tone = "paper",
}: SwitchRowProps) {
	const ids = useId();
	return (
		<div className={tone === "bone" ? "toggle bone" : "toggle"}>
			<label className={disabled ? "toggle-main off" : "toggle-main"}>
				<span>
					<b id={`${ids}-title`}>{title}</b>
					<small id={`${ids}-help`}>{children}</small>
				</span>
				<span className="sw-wrap">
					<input
						type="checkbox"
						role="switch"
						aria-checked={checked}
						aria-labelledby={`${ids}-title`}
						aria-describedby={`${ids}-help`}
						className="sw-input"
						checked={checked}
						disabled={disabled}
						onChange={(event) => onChange(event.currentTarget.checked)}
					/>
					<span className={checked ? "sw on" : "sw"} aria-hidden="true" />
				</span>
			</label>
			{extra}
		</div>
	);
}
