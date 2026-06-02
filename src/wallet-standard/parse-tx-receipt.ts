import { TransportError, type TxReceipt } from "@arcadiasystems/morse-sdk";
import type { SuiClientTypes } from "@mysten/sui/client";
import { collectCreatedObjects } from "./collect-created-objects.js";
import { collectDeletedObjects } from "./collect-deleted-objects.js";
import { computeGasUsedMist } from "./compute-gas-used-mist.js";

/**
 * Map a finalized Sui transaction (with effects + objectTypes included) into
 * the SDK's `TxReceipt` shape.
 *
 * @throws {TransportError} when effects are missing despite the include flag.
 */
export function parseTxReceipt(
	tx: SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>,
): TxReceipt {
	const effects = tx.effects;
	if (!effects) {
		throw new TransportError(
			"transaction effects missing despite include flag",
		);
	}
	const objectTypes = tx.objectTypes ?? {};
	return {
		digest: tx.digest,
		gasUsedMist: computeGasUsedMist(effects.gasUsed),
		createdObjects: collectCreatedObjects(effects.changedObjects, objectTypes),
		deletedObjects: collectDeletedObjects(effects.changedObjects),
	};
}
