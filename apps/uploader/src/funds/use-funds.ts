import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useCallback } from "react";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import { assessFunds } from "./assess-funds";
import { readBalances } from "./read-balances";
import { readWalrusPrices } from "./read-walrus-prices";
import type {
	Balances,
	FundsAssessment,
	FundsFloor,
	WalrusPrices,
} from "./types";

export interface Funds {
	balances: ChainRead<Balances>;
	prices: ChainRead<WalrusPrices>;
	/** Known once prices are read; `null` until then or when the read failed. */
	floor: FundsFloor | null;
	/** Known once both balances and prices are read. */
	assessment: FundsAssessment | null;
	refresh: () => void;
}

/**
 * Balances for the address and live Walrus prices for the network, and the
 * low-funds assessment built from them. `address` is `null` when no wallet is
 * connected; prices are read either way.
 */
export function useFunds(
	network: NetworkConfig,
	address: string | null,
): Funds {
	const client = useCurrentClient();
	const balances = useChainRead(
		address === null ? null : `${network.id}:${address}`,
		(signal) =>
			address === null
				? Promise.reject(new Error("No wallet is connected."))
				: readBalances(client, address, network.walCoinType, signal),
	);
	const prices = useChainRead(network.id, () => readWalrusPrices(client));

	const floor: FundsFloor | null =
		prices.read.status === "ready"
			? {
					walFrost: prices.read.data.smallestUpload,
					suiMist: network.uploadGasMist,
				}
			: null;
	const assessment =
		floor && balances.read.status === "ready"
			? assessFunds(balances.read.data, floor)
			: null;

	const refreshBalances = balances.refresh;
	const refreshPrices = prices.refresh;
	const refresh = useCallback(() => {
		refreshBalances();
		refreshPrices();
	}, [refreshBalances, refreshPrices]);

	return {
		balances: balances.read,
		prices: prices.read,
		floor,
		assessment,
		refresh,
	};
}
