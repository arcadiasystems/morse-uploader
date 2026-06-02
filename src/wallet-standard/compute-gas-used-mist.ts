import type { SuiClientTypes } from "@mysten/sui/client";

/** Net gas spent in MIST: computation + storage cost, minus the storage rebate. */
export function computeGasUsedMist(gas: SuiClientTypes.GasCostSummary): bigint {
	return (
		BigInt(gas.computationCost) +
		BigInt(gas.storageCost) -
		BigInt(gas.storageRebate)
	);
}
