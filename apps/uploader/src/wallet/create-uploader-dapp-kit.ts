import { createDAppKit } from "@mysten/dapp-kit-react";
import { createNetworkClient } from "@/network/create-network-client";
import { NETWORK_IDS, type NetworkId } from "@/network/networks";

/**
 * The dApp Kit instance: Wallet Standard discovery, the connection, the
 * current network and one client per network. Created in the browser only.
 */
export function createUploaderDAppKit(defaultNetwork: NetworkId) {
	return createDAppKit({
		networks: [...NETWORK_IDS],
		defaultNetwork,
		createClient: createNetworkClient,
		slushWalletConfig: { appName: "Morse Uploader" },
		storageKey: "morse-uploader:wallet-session",
	});
}

export type UploaderDAppKit = ReturnType<typeof createUploaderDAppKit>;

declare module "@mysten/dapp-kit-react" {
	interface Register {
		dAppKit: UploaderDAppKit;
	}
}
