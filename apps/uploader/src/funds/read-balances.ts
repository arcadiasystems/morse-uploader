import type { NetworkClient } from "@/network/create-network-client";
import { getWalCoinType } from "@/network/get-wal-coin-type";
import type { WalCoinTypeSource } from "@/network/networks";
import type { Balances } from "./types";

/** Reads the owner's total SUI and WAL balances from chain. */
export async function readBalances(
	client: NetworkClient,
	owner: string,
	walCoinType: WalCoinTypeSource,
	signal: AbortSignal,
): Promise<Balances> {
	const coinType = await getWalCoinType(client, walCoinType);
	const [sui, wal] = await Promise.all([
		client.core.getBalance({ owner, signal }),
		client.core.getBalance({ owner, coinType, signal }),
	]);
	return { sui: BigInt(sui.balance.balance), wal: BigInt(wal.balance.balance) };
}
