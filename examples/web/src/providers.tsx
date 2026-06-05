import {
	createNetworkConfig,
	SuiClientProvider,
	WalletProvider,
} from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SUI_JSONRPC_URL } from "./morse-config";
import "@mysten/dapp-kit/dist/index.css";

const { networkConfig } = createNetworkConfig({
	testnet: {
		url: SUI_JSONRPC_URL ?? getJsonRpcFullnodeUrl("testnet"),
		network: "testnet",
	},
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>
			<SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
				<WalletProvider autoConnect>{children}</WalletProvider>
			</SuiClientProvider>
		</QueryClientProvider>
	);
}
