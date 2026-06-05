import { TransportError, type TxReceipt } from "@arcadiasystems/morse-sdk";
import type { SuiClientTypes } from "@mysten/sui/client";
import { collectCreatedObjects } from "./collect-created-objects.js";
import { collectDeletedObjects } from "./collect-deleted-objects.js";
import { computeGasUsedMist } from "./compute-gas-used-mist.js";

/**
 * Map a finalized Sui transaction (with effects + objectTypes included) into
 * the SDK's `TxReceipt` shape. `objectTypes` defaults to the transaction's own
 * `objectTypes`, but the adapter can pass an augmented map when it had to
 * resolve created-object types separately.
 *
 * @throws {TransportError} when effects are missing despite the include flag.
 */
export function parseTxReceipt(
	tx: SuiClientTypes.Transaction<{ effects: true; objectTypes: true }>,
	objectTypes: Record<string, string> = tx.objectTypes ?? {},
): TxReceipt {
	const effects = tx.effects;
	if (!effects) {
		throw new TransportError(
			`transaction effects missing despite include flag (receipt keys: ${Object.keys(
				tx,
			).join(", ")})`,
		);
	}
	return {
		digest: tx.digest,
		gasUsedMist: computeGasUsedMist(effects.gasUsed),
		createdObjects: collectCreatedObjects(effects.changedObjects, objectTypes),
		deletedObjects: collectDeletedObjects(effects.changedObjects),
	};
}
