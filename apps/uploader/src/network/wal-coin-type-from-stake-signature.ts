import type { SuiClientTypes } from "@mysten/sui/client";
import { normalizeStructTag } from "@mysten/sui/utils";

/**
 * Reads the WAL coin type from the signature of
 * `staking::stake_with_pool(&mut Staking, Coin<WAL>, ID, &mut TxContext)`,
 * the same source @mysten/walrus uses internally.
 * @throws {Error} When the second parameter is not a `Coin<T>` of a datatype.
 */
export function walCoinTypeFromStakeSignature(
	fn: SuiClientTypes.FunctionResponse,
): string {
	const coin = fn.parameters[1]?.body;
	const inner =
		coin?.$kind === "datatype" ? coin.datatype.typeParameters[0] : undefined;
	if (inner?.$kind !== "datatype") {
		throw new Error(
			"Could not find the WAL coin type in staking::stake_with_pool.",
		);
	}
	return normalizeStructTag(inner.datatype.typeName);
}
