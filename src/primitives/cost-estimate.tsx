import type { ReactElement } from "react";
import type { CostEstimateProps } from "../types.js";
import { formatTokenAmount } from "../utils/format-token-amount.js";

const DEFAULT_LABELS = {
	loading: "Estimating...",
	error: "Estimate unavailable",
	wal: "WAL",
	sui: "SUI gas",
};

/** Presentational WAL (+ optional SUI gas) cost readout. Formatters injectable. */
export function CostEstimate(props: CostEstimateProps): ReactElement {
	const {
		estimate,
		status,
		formatWal = (frost) => formatTokenAmount(frost),
		formatSui = (mist) => formatTokenAmount(mist),
		className,
		labels,
	} = props;
	const text = { ...DEFAULT_LABELS, ...labels };

	if (status === "loading") {
		return (
			<div className={className} data-mu="cost" aria-live="polite">
				{text.loading}
			</div>
		);
	}
	if (status === "error") {
		return (
			<div className={className} data-mu="cost" aria-live="polite">
				{text.error}
			</div>
		);
	}
	if (estimate === null) {
		return <div className={className} data-mu="cost" aria-live="polite" />;
	}
	return (
		<div className={className} data-mu="cost" aria-live="polite">
			<span data-mu="cost-wal">
				{formatWal(estimate.walFrost)} {text.wal}
			</span>
			{estimate.suiGasMist !== null ? (
				<span data-mu="cost-sui">
					{formatSui(estimate.suiGasMist)} {text.sui}
				</span>
			) : null}
		</div>
	);
}
