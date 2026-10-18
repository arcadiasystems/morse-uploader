import { parseStructTag } from "@mysten/sui/utils";
import type { NetworkClient } from "./create-network-client";
import type { WalCoinTypeSource } from "./networks";
import { walCoinTypeFromStakeSignature } from "./wal-coin-type-from-stake-signature";

/**
 * The WAL coin type for the client's network. A fixed type is returned as is;
 * otherwise it is read once from the Walrus package that owns the Blob type
 * and cached on the client.
 */
export async function getWalCoinType(
	client: NetworkClient,
	source: WalCoinTypeSource,
): Promise<string> {
	if (source.kind === "fixed") return source.coinType;
	return client.cache.read(["morse-uploader", "walCoinType"], async () => {
		const packageId = parseStructTag(await client.walrus.getBlobType()).address;
		const { function: stakeWithPool } = await client.core.getMoveFunction({
			packageId,
			moduleName: "staking",
			name: "stake_with_pool",
		});
		return walCoinTypeFromStakeSignature(stakeWithPool);
	});
}
