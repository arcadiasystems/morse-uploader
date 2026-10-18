import { useCurrentClient } from "@mysten/dapp-kit-react";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import type { NetworkId } from "@/network/networks";
import { type PublishTarget, readPublishTargets } from "./read-publish-targets";

/**
 * The publications and collections the wallet can add entries to, read
 * when "Also publish to Morse" is first turned on. `owner` is `null` until
 * then, which reads nothing.
 */
export function usePublishTargets(
	network: NetworkId,
	owner: string | null,
): { read: ChainRead<PublishTarget[]>; refresh: () => void } {
	const client = useCurrentClient();
	return useChainRead(
		owner === null ? null : `${network}:${owner}`,
		(signal) =>
			owner === null
				? Promise.reject(new Error("No wallet is connected."))
				: readPublishTargets(client, network, owner, signal),
	);
}
