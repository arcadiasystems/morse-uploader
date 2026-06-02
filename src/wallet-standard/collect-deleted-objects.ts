import { type TxDeletedObject, toSuiObjectId } from "@arcadiasystems/morse-sdk";
import type { SuiClientTypes } from "@mysten/sui/client";

/** Deleted objects from a transaction's changed-object set. */
export function collectDeletedObjects(
	changes: readonly SuiClientTypes.ChangedObject[],
): TxDeletedObject[] {
	const out: TxDeletedObject[] = [];
	for (const change of changes) {
		if (change.idOperation !== "Deleted") continue;
		out.push({ objectId: toSuiObjectId(change.objectId) });
	}
	return out;
}
