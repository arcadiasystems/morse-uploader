import { useCurrentClient } from "@mysten/dapp-kit-react";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import type { ActivityItem } from "./activity";
import { readActivity } from "./read-activity";

/** The wallet's recent Walrus and Morse transactions; nothing is read without a wallet. */
export function useActivity(
	network: NetworkConfig,
	address: string | null,
): { read: ChainRead<ActivityItem[]>; refresh: () => void } {
	const client = useCurrentClient();
	return useChainRead(
		address === null ? null : `${network.id}:${address}`,
		(signal) =>
			address === null
				? Promise.reject(new Error("No wallet is connected."))
				: readActivity(client, network, address, signal),
	);
}
