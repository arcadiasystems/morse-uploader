import { useCallback, useEffect, useState } from "react";
import { useMorseUploaderContext } from "../context/use-morse-uploader-context.js";
import { estimateEpochCost } from "../core/estimate-epoch-cost.js";
import type {
	CostStatus,
	EpochCostArgs,
	EpochCostEstimate,
	UseEpochCostEstimateOptions,
	UseEpochCostEstimateResult,
} from "../types.js";

/**
 * Live per-epoch cost estimate. Recomputes when `sizeBytes`, `epochs`,
 * `encrypt`, or `suiGasMist` change. Reads the WAL cost from the context's
 * `walrusClient`; SUI gas is whatever the caller passes through.
 *
 * Consumers driving this from a slider should debounce the inputs, since each
 * change triggers a Walrus pricing call.
 *
 * @throws {Error} (via `refresh`) when the context has no walrusClient.
 */
export function useEpochCostEstimate(
	options: UseEpochCostEstimateOptions,
): UseEpochCostEstimateResult {
	const ctx = useMorseUploaderContext();
	const [status, setStatus] = useState<CostStatus>("idle");
	const [estimate, setEstimate] = useState<EpochCostEstimate | null>(null);
	const [error, setError] = useState<unknown>(null);

	const { walrusClient } = ctx;
	const { sizeBytes, epochs, encrypt, suiGasMist } = options;
	const enabled = options.enabled ?? true;

	const compute = useCallback(
		async (signal?: AbortSignal): Promise<EpochCostEstimate | null> => {
			if (walrusClient === undefined) {
				throw new Error(
					"useEpochCostEstimate requires a walrusClient on the MorseUploader context.",
				);
			}
			setStatus("loading");
			setError(null);
			try {
				const costArgs: EpochCostArgs = {
					sizeBytes,
					epochs,
					...(encrypt === undefined ? {} : { encrypt }),
					...(suiGasMist === undefined ? {} : { suiGasMist }),
				};
				const result = await estimateEpochCost(walrusClient, costArgs);
				// A newer compute (or unmount) aborted this one; do not clobber state.
				if (signal?.aborted) {
					return result;
				}
				setEstimate(result);
				setStatus("success");
				return result;
			} catch (err) {
				if (signal?.aborted) {
					throw err;
				}
				setError(err);
				setStatus("error");
				throw err;
			}
		},
		[walrusClient, sizeBytes, epochs, encrypt, suiGasMist],
	);

	useEffect(() => {
		if (!enabled) {
			return;
		}
		const controller = new AbortController();
		compute(controller.signal).catch(() => undefined);
		return () => controller.abort();
	}, [enabled, compute]);

	const refresh = useCallback(() => compute(), [compute]);
	return { status, estimate, error, refresh };
}
