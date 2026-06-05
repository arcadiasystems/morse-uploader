import { useMemo } from "react";
import { DEFAULT_ENCRYPTION_OVERHEAD_BYTES } from "../constants/default-encryption-overhead-bytes.js";
import { epochDurationMs } from "./epoch-duration-ms.js";
import { estimateStorageUsd } from "./estimate-storage-usd.js";
import type {
	UseStorageCostEstimateOptions,
	UseStorageCostEstimateResult,
} from "./types.js";
import { useMorseFilesContext } from "./use-morse-files-context.js";

/**
 * Deterministic USD storage-cost estimate for a pending upload. Uses Walrus
 * predictable pricing ($0.023/GB/month) with the network's nominal epoch length
 * from the active handles. When `encrypt` is set, the Seal envelope overhead is
 * folded into the priced size so the figure tracks the encrypt toggle.
 */
export function useStorageCostEstimate(
	options: UseStorageCostEstimateOptions,
): UseStorageCostEstimateResult {
	const { network } = useMorseFilesContext();
	const { sizeBytes, epochs, encrypt, usdPerGbPerMonth } = options;

	const estimate = useMemo(
		() =>
			estimateStorageUsd({
				sizeBytes,
				epochs,
				epochDurationMs: epochDurationMs(network),
				encryptionOverheadBytes: encrypt
					? DEFAULT_ENCRYPTION_OVERHEAD_BYTES
					: 0,
				...(usdPerGbPerMonth === undefined ? {} : { usdPerGbPerMonth }),
			}),
		[network, sizeBytes, epochs, encrypt, usdPerGbPerMonth],
	);

	return { estimate };
}
