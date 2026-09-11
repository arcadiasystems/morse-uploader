import type { WalletStandardAccount } from "@arcadiasystems/morse-sdk";
import {
	type MorseFilesWalletCallbacks,
	type UseMorseFilesResult,
	useMorseFiles,
} from "@arcadiasystems/morse-uploader";
import {
	useSignAndExecuteTransaction,
	useSignPersonalMessage,
	useSignTransaction,
} from "@mysten/dapp-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
// Hand Walrus the wasm URL explicitly. Without this, @mysten/walrus resolves a
// path that Vite serves as index.html, so WebAssembly.instantiate fails.
import walrusWasmUrl from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";
import { useMemo } from "react";
import { MAINNET_SEAL_COMMITTEE } from "@arcadiasystems/morse-sdk";
import {
	type MorseNetwork,
	SEAL_API_KEY,
	SUI_GRPC_URL,
	uploadRelayHost,
	UPLOAD_RELAY_TIP_MAX_MIST,
} from "./morse-config";

/**
 * Build the morse-uploader files handles from the connected dapp-kit wallet.
 * Call this only when a wallet is connected (pass the non-null account). Direct
 * write mode: the user's wallet pays for and signs the Walrus storage and gas;
 * the browser writes via Walrus's upload relay.
 */
export function useFilesSetup(
	account: WalletStandardAccount,
	network: MorseNetwork,
): UseMorseFilesResult {
	const { mutateAsync: signTransaction } = useSignTransaction();
	const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
	const { mutateAsync: signAndExecuteTransaction } =
		useSignAndExecuteTransaction();

	// When a dedicated gRPC RPC is configured, build the SDK's reads/builds on it
	// (pair it with the same node's JSON-RPC URL in providers.tsx). Otherwise the
	// package defaults to the public gRPC endpoint.
	const suiClient = useMemo(
		() =>
			SUI_GRPC_URL === undefined
				? undefined
				: new SuiGrpcClient({ network, baseUrl: SUI_GRPC_URL }),
		[network],
	);

	const callbacks: MorseFilesWalletCallbacks = useMemo(
		() => ({
			signTransaction: ({ transaction }) => signTransaction({ transaction }),
			signPersonalMessage: ({ message }) => signPersonalMessage({ message }),
			signAndExecuteTransaction: ({ transaction }) =>
				signAndExecuteTransaction({ transaction }),
		}),
		[signTransaction, signPersonalMessage, signAndExecuteTransaction],
	);

	// Mainnet pins no Seal key servers, so encrypted files there need a
	// credential. Without one the hook still builds and the unencrypted paths
	// work; only the encrypted ones report that they are unavailable.
	const sealKeyServers = useMemo(() => {
		if (network !== "mainnet" || SEAL_API_KEY === undefined) {
			return undefined;
		}
		return MAINNET_SEAL_COMMITTEE.map((server) => ({
			...server,
			apiKeyName: "X-API-Key",
			apiKey: SEAL_API_KEY,
		}));
	}, [network]);

	return useMorseFiles({
		network,
		account,
		callbacks,
		...(suiClient === undefined ? {} : { suiClient }),
		...(sealKeyServers === undefined ? {} : { sealKeyServers }),
		walrusWriteConfig: {
			wasmUrl: walrusWasmUrl,
			uploadRelay: {
				host: uploadRelayHost(network),
				sendTip: { max: UPLOAD_RELAY_TIP_MAX_MIST },
			},
		},
	});
}
