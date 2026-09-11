import {
	createNetworkConfig,
	SuiClientProvider,
	WalletProvider,
} from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_NETWORK, jsonRpcUrl } from "./morse-config";
import "@mysten/dapp-kit/dist/index.css";

const { networkConfig } = createNetworkConfig({
	testnet: {
		url: jsonRpcUrl("testnet"),
		network: "testnet",
	},
	mainnet: {
		// A dedicated RPC, when set, is assumed to be for the network you are
		// actually using; point it at the right one before switching.
		url: jsonRpcUrl("mainnet"),
		network: "mainnet",
	},
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<SuiClientProvider networks={networkConfig} defaultNetwork={DEFAULT_NETWORK}>
				<WalletProvider autoConnect>{children}</WalletProvider>
			</SuiClientProvider>
		</QueryClientProvider>
	);
}
