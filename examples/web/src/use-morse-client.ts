import {
	BrowserStoragePubkeyCache,
	DefaultWalrusWriteAdapter,
	morseConfig,
	WalletStandardSigner,
} from "@arcadiasystems/morse-sdk";
import type { MorseUploaderContextValue } from "@arcadiasystems/morse-uploader";
import {
	useCurrentAccount,
	useSignPersonalMessage,
	useSignTransaction,
} from "@mysten/dapp-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { WalrusClient } from "@mysten/walrus";
// Hand Walrus the wasm URL explicitly. Without this, @mysten/walrus resolves a
// wasm path that Vite serves as index.html, so WebAssembly.instantiate fails
// with "expected magic word ... found 3c 21 64 6f" (that is "<!do", i.e. HTML).
import walrusWasmUrl from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";
import { useEffect, useMemo, useState } from "react";
import {
	type MorseNetwork,
	UPLOAD_RELAY_HOST,
	UPLOAD_RELAY_TIP_MAX_MIST,
} from "./morse-config";

function pickPubkeyCache(): BrowserStoragePubkeyCache | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	try {
		return new BrowserStoragePubkeyCache();
	} catch {
		return undefined;
	}
}

/**
 * Builds the MorseUploader context value for direct (user-pays) uploads: the
 * connected wallet signs and pays the Walrus storage and gas; the browser uses
 * Walrus's upload relay for the storage-node fan-out. No publisher, no
 * publication.
 *
 * Returns null when no wallet is connected, the network is unsupported (mainnet
 * throws today), or while the signer is being prepared.
 */
export function useMorseClient(
	network: MorseNetwork,
): MorseUploaderContextValue | null {
	const account = useCurrentAccount();
	const { mutateAsync: signTransaction } = useSignTransaction();
	const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
	const [value, setValue] = useState<MorseUploaderContextValue | null>(null);

	// Synchronous pieces that do not need the async signer.
	const baseline = useMemo(() => {
		if (account === null) {
			return null;
		}
		let config: ReturnType<typeof morseConfig>;
		try {
			config = morseConfig({ network });
		} catch {
			return null;
		}
		const client = new SuiGrpcClient({ network, baseUrl: config.rpcUrl });
		return { config, client, address: account.address };
	}, [account, network]);

	useEffect(() => {
		setValue(null);
		if (baseline === null || account === null) {
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const signer = await WalletStandardSigner.fromAccountAsync(
					account,
					{
						signTransaction: ({ transaction }) =>
							signTransaction({ transaction }),
						signPersonalMessage: ({ message }) =>
							signPersonalMessage({ message }),
					},
					{ pubkeyCache: pickPubkeyCache() },
				);
				if (cancelled) {
					return;
				}
				// Direct write: the wallet pays + signs; the relay does the fan-out.
				const walrus = DefaultWalrusWriteAdapter.fromConfig(
					{
						network,
						suiClient: baseline.client,
						wasmUrl: walrusWasmUrl,
						uploadRelay: {
							host: UPLOAD_RELAY_HOST,
							sendTip: { max: UPLOAD_RELAY_TIP_MAX_MIST },
						},
					},
					signer,
				);
				const walrusClient = new WalrusClient({
					network,
					suiClient: baseline.client,
					wasmUrl: walrusWasmUrl,
				});
				setValue({
					config: baseline.config,
					client: baseline.client,
					signer,
					walrus,
					walrusClient,
					address: baseline.address,
					defaultEpochs: 12,
					// "Open" links point at this app's own viewer route
					// (origin + /:blobId), so it can present download or encrypted.
					shareUrl: { pattern: "/:blobId" },
				} as MorseUploaderContextValue);
			} catch {
				if (!cancelled) {
					setValue(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [baseline, account, network, signTransaction, signPersonalMessage]);

	return value;
}
