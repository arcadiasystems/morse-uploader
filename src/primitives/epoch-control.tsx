import type { ReactElement } from "react";
import type { EpochControlProps } from "../types.js";
import { clamp } from "../utils/clamp.js";

/**
 * Controlled stepper for the storage duration (epochs). Unstyled: hooks are
 * `className` and `data-mu` attributes. Clamping logic lives in the `clamp`
 * util, keeping this component presentational.
 */
export function EpochControl(props: EpochControlProps): ReactElement {
	const {
		value,
		onChange,
		min = 1,
		max = Number.MAX_SAFE_INTEGER,
		step = 1,
		presets,
		disabled = false,
		className,
		label = "Storage duration (epochs)",
		decrementLabel = "Decrease epochs",
		incrementLabel = "Increase epochs",
	} = props;

	const set = (next: number) => {
		if (!disabled && !Number.isNaN(next)) {
			onChange(clamp(next, min, max));
		}
	};

	return (
		<div className={className} data-mu="epoch-control">
			<span data-mu="epoch-label">{label}</span>
			<button
				type="button"
				aria-label={decrementLabel}
				disabled={disabled || value <= min}
				onClick={() => set(value - step)}
			>
				-
			</button>
			<input
				type="number"
				inputMode="numeric"
				aria-label={label}
				value={value}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onChange={(event) => set(Number(event.target.value))}
				data-mu="epoch-input"
			/>
			<button
				type="button"
				aria-label={incrementLabel}
				disabled={disabled || value >= max}
				onClick={() => set(value + step)}
			>
				+
			</button>
			{presets !== undefined && presets.length > 0 ? (
				<div data-mu="epoch-presets">
					{presets.map((preset) => (
						<button
							key={preset}
							type="button"
							aria-pressed={value === preset}
							disabled={disabled}
							onClick={() => set(preset)}
						>
							{preset}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
