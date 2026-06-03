import { DEFAULT_ENCRYPTION_OVERHEAD_BYTES } from "../constants/default-encryption-overhead-bytes.js";
import type {
	EpochCostArgs,
	EpochCostEstimate,
	WalrusStorageCostSource,
} from "../types.js";
import { estimateStorageCost } from "./estimate-storage-cost.js";

/**
 * Estimate the cost to store a file for `epochs`: the WAL storage cost (from the
 * Walrus client) plus an optional caller-supplied SUI gas figure. When
 * `encrypt` is set, the size used for pricing includes the Seal envelope
 * overhead so the toggle moves the estimate.
 */
export async function estimateEpochCost(
	source: WalrusStorageCostSource,
	args: EpochCostArgs,
): Promise<EpochCostEstimate> {
	const encrypted = args.encrypt === true;
	const overhead = encrypted
		? (args.encryptionOverheadBytes ?? DEFAULT_ENCRYPTION_OVERHEAD_BYTES)
		: 0;
	const storage = await estimateStorageCost(
		source,
		args.sizeBytes + overhead,
		args.epochs,
	);
	return {
		sizeBytes: args.sizeBytes,
		epochs: args.epochs,
		encrypted,
		storage,
		walFrost: storage.totalCostFrost,
		suiGasMist: args.suiGasMist ?? null,
	};
}
