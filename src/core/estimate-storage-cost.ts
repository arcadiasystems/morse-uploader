import type { StorageCostEstimate, WalrusStorageCostSource } from "../types.js";

/**
 * Read the WAL storage cost for a blob of `sizeBytes` stored for `epochs`. The
 * Walrus client accounts for the encoded size internally. Costs are in FROST.
 */
export async function estimateStorageCost(
	source: WalrusStorageCostSource,
	sizeBytes: number,
	epochs: number,
): Promise<StorageCostEstimate> {
	const { storageCost, writeCost, totalCost } = await source.storageCost(
		sizeBytes,
		epochs,
	);
	return {
		storageCostFrost: storageCost,
		writeCostFrost: writeCost,
		totalCostFrost: totalCost,
	};
}
