import type { NetworkClient } from "@/network/create-network-client";
import type { WalrusPrices } from "./types";

/**
 * Reads storage and write prices from the Walrus system object. Prices can
 * change at any moment through node votes, so callers re-read them rather
 * than keeping them for long.
 */
export async function readWalrusPrices(
	client: NetworkClient,
): Promise<WalrusPrices> {
	const [state, smallest] = await Promise.all([
		client.walrus.systemState(),
		client.walrus.storageCost(1, 1),
	]);
	return {
		storagePerUnit: BigInt(state.storage_price_per_unit_size),
		smallestUpload: smallest.totalCost,
	};
}
