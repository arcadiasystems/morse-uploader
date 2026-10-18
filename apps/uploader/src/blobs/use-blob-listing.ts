import { useCurrentClient } from "@mysten/dapp-kit-react";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import type { NetworkClient } from "@/network/create-network-client";
import type { NetworkConfig } from "@/network/networks";
import type { BlobRecord } from "./blob-record";
import { type EpochClock, readEpochClock } from "./epoch-clock";
import { readOwnedBlobs } from "./read-owned-blobs";

/** The wallet's blobs and the epoch clock their status is computed against. */
export interface BlobListing {
	blobs: readonly BlobRecord[];
	clock: EpochClock;
}

async function readBlobListing(
	client: NetworkClient,
	owner: string,
	signal: AbortSignal,
): Promise<BlobListing> {
	const [clock, blobs] = await Promise.all([
		readEpochClock(client),
		readOwnedBlobs(client, owner, signal),
	]);
	return { blobs, clock };
}

/**
 * The connected address's blobs on the current network. Re-read when the
 * address or network changes, when the tab is shown again and on `refresh()`.
 * `address` is `null` when no wallet is connected.
 */
export function useBlobListing(
	network: NetworkConfig,
	address: string | null,
): { read: ChainRead<BlobListing>; refresh: () => void } {
	const client = useCurrentClient();
	return useChainRead(
		address === null ? null : `${network.id}:${address}`,
		(signal) =>
			address === null
				? Promise.reject(new Error("No wallet is connected."))
				: readBlobListing(client, address, signal),
	);
}
