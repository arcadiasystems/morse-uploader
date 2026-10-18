import { useCurrentClient } from "@mysten/dapp-kit-react";
import { useCallback } from "react";
import { type ChainRead, useChainRead } from "@/lib/use-chain-read";
import type { NetworkConfig } from "@/network/networks";
import { type Publications, readPublications } from "./read-publications";
import { readSharedFiles, type SharedFiles } from "./read-shared-files";

export interface MorseReads {
	/** The publications the wallet owns or writes to, with their entries. */
	publications: ChainRead<Publications>;
	/** The wallet's RecipientFiles that someone besides the owner can decrypt. */
	shared: ChainRead<SharedFiles>;
	refresh: () => void;
}

/** What Morse records about the wallet's blobs; nothing is read without a wallet. */
export function useMorseReads(
	network: NetworkConfig,
	address: string | null,
): MorseReads {
	const client = useCurrentClient();
	const key = address === null ? null : `${network.id}:${address}`;
	const noWallet = () => Promise.reject(new Error("No wallet is connected."));
	const publications = useChainRead(key, (signal) =>
		address === null
			? noWallet()
			: readPublications(client, network.id, address, signal),
	);
	const shared = useChainRead(key, (signal) =>
		address === null
			? noWallet()
			: readSharedFiles(client, network, address, signal),
	);
	const refreshPublications = publications.refresh;
	const refreshShared = shared.refresh;
	const refresh = useCallback(() => {
		refreshPublications();
		refreshShared();
	}, [refreshPublications, refreshShared]);
	return { publications: publications.read, shared: shared.read, refresh };
}
