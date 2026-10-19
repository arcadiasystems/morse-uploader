import { useCurrentClient } from "@mysten/dapp-kit-react";
import { type EpochClock, readEpochClock } from "@/blobs/epoch-clock";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import { readSealSettings } from "@/morse/seal-encryption";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import { readRelayTipConfig } from "./relay-tip-config";
import {
	type RegisterShape,
	simulateRegisterGas,
} from "./simulate-register-gas";
import type { RelayTipConfig, WalrusPricing } from "./upload-cost";
import type { SealSettings } from "./upload-plan";

/** What an upload is priced with: read when the tray opens, and again before signing. */
export interface QuoteInputs {
	pricing: WalrusPricing;
	clock: EpochClock;
	/** `null` when the relay asks no tip. */
	tip: RelayTipConfig | null;
	/** `null` where Seal is unavailable (Walrus Mainnet). */
	seal: SealSettings | null;
}

/**
 * Live prices from the Walrus system object, the epoch clock, the relay tip
 * and the Seal settings, read from chain now (PROTOCOL-NOTES section 4).
 */
export async function readQuoteInputs(
	client: NetworkClient,
	network: NetworkConfig,
	signal: AbortSignal,
): Promise<QuoteInputs> {
	const [clock, tip, seal] = await Promise.all([
		// Resets the SDK's Walrus cache first, so the system state below is current.
		readEpochClock(client),
		readRelayTipConfig(network.uploadRelayUrl, signal),
		network.seal.kind === "available" ? readSealSettings(network.id) : null,
	]);
	const state = await client.walrus.systemState();
	return {
		clock,
		tip,
		seal,
		pricing: {
			storagePricePerUnit: BigInt(state.storage_price_per_unit_size),
			writePricePerUnit: BigInt(state.write_price_per_unit_size),
			nShards: state.committee.n_shards,
		},
	};
}

/**
 * The quote inputs, read each time `session` changes (the tray opens) and
 * when the tab is shown again: prices can change at any moment
 * (PROTOCOL-NOTES section 4).
 */
export function useQuoteInputs(
	network: NetworkConfig,
	session: number | null,
): ChainRead<QuoteInputs> {
	const client = useCurrentClient();
	return useChainRead(
		session === null ? null : `${network.id}:${session}`,
		(signal) => readQuoteInputs(client, network, signal),
	).read;
}

export interface GasRequest {
	owner: string;
	epochs: number;
	deletable: boolean;
	items: readonly RegisterShape[];
}

/**
 * The simulated gas of each register transaction for the tray's current
 * choices, re-run whenever they change. `null` reads nothing.
 */
export function useRegisterGas(
	network: NetworkConfig,
	request: GasRequest | null,
): ChainRead<bigint[]> {
	const client = useCurrentClient();
	const key =
		request === null
			? null
			: JSON.stringify([
					network.id,
					request.owner,
					request.epochs,
					request.deletable,
					request.items,
				]);
	return useChainRead(key, (signal) =>
		request === null
			? Promise.reject(new Error("Nothing to estimate."))
			: simulateRegisterGas({
					client,
					network: network.id,
					...request,
					signal,
				}),
	).read;
}
