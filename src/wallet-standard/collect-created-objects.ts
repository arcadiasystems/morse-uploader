import { type TxCreatedObject, toSuiObjectId } from "@arcadiasystems/morse-sdk";
import type { SuiClientTypes } from "@mysten/sui/client";

/**
 * Created objects from a transaction's changed-object set, paired with their
 * on-chain types. Skips changes with no resolved type.
 */
export function collectCreatedObjects(
	changes: readonly SuiClientTypes.ChangedObject[],
	objectTypes: Record<string, string>,
): TxCreatedObject[] {
	const out: TxCreatedObject[] = [];
	for (const change of changes) {
		if (change.idOperation !== "Created") continue;
		const objectType = objectTypes[change.objectId];
		if (objectType === undefined) continue;
		out.push({ objectId: toSuiObjectId(change.objectId), objectType });
	}
	return out;
}
