import {
	DefaultSealAdapter,
	DefaultWalrusWriteAdapter,
	HttpAggregatorReadAdapter,
	morseConfig,
	RpcRecipientFilesReader,
	WalletStandardSigner,
	type WalrusAdapterConfig,
} from "@arcadiasystems/morse-sdk";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { useEffect, useRef, useState } from "react";
import { WalletStandardAdapter } from "../wallet-standard/wallet-standard-adapter.js";
import { pickPubkeyCache } from "./pick-pubkey-cache.js";
import { resolveSealServers } from "./resolve-seal-servers.js";
import type { UseMorseFilesOptions, UseMorseFilesResult } from "./types.js";

/**
 * Setup hook for the files flow. Builds the SDK handles from the connected
 * wallet: a `WalletStandardAdapter` for on-chain ops, a `WalletStandardSigner`
 * (via fromAccountAsync + a pubkey cache) for Walrus writes and the Seal
 * SessionKey, the Walrus write/read adapters, the Seal adapter, and the files
 * reader. Async because fromAccountAsync may probe the wallet once.
 *
 * Wrap your tree in `<MorseFilesProvider value={result.handles}>` once `status`
 * is `"ready"`.
 */
export function useMorseFiles(
	options: UseMorseFilesOptions,
): UseMorseFilesResult {
	const { network } = options;
	const address = options.account.address;
	const [result, setResult] = useState<UseMorseFilesResult>({
		status: "idle",
		handles: null,
		error: null,
	});

	// Rebuild only when the network or wallet address changes. Everything else
	// (the account object, callbacks, and optional adapters) is read from the
	// latest options via a ref, so passing fresh object/callback literals on
	// every render does not retrigger setup and loop.
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		let cancelled = false;
		setResult({ status: "preparing", handles: null, error: null });
		(async () => {
			try {
				const current = optionsRef.current;
				const { account, callbacks } = current;
				const config = morseConfig({ network });
				// Use the provided gRPC client (e.g. a dedicated RPC) or build one on
				// the network's public RPC.
				const client =
					current.suiClient ??
					new SuiGrpcClient({ network, baseUrl: config.rpcUrl });
				const adapter = new WalletStandardAdapter(
					address,
					callbacks.signAndExecuteTransaction,
					client,
				);
				const pubkeyCache = current.pubkeyCache ?? pickPubkeyCache();
				const signer = await WalletStandardSigner.fromAccountAsync(
					account,
					{
						signTransaction: callbacks.signTransaction,
						signPersonalMessage: callbacks.signPersonalMessage,
					},
					pubkeyCache === undefined ? undefined : { pubkeyCache },
				);
				if (cancelled) {
					return;
				}
				const walrusWrite =
					current.walrusWrite ??
					DefaultWalrusWriteAdapter.fromConfig(
						{
							network,
							suiClient: client,
							...(current.walrusWriteConfig ?? {}),
						} as WalrusAdapterConfig,
						signer,
					);
				const walrusRead =
					current.walrusRead ??
					HttpAggregatorReadAdapter.fromMorseConfig(config, client);
				// Built only when key servers exist. Testnet pins an open set;
				// mainnet pins none, because every operator there is commercial.
				// Failing setup outright would take the unencrypted flows down
				// too, so this is null and the encrypted hooks reject instead.
				const sealServers = resolveSealServers(
					current.sealKeyServers,
					config.sealKeyServers,
				);
				const seal =
					current.seal ??
					(sealServers === undefined
						? null
						: DefaultSealAdapter.fromMorseConfig(
								config,
								{ serverConfigs: sealServers },
								client,
							));
				const reader = RpcRecipientFilesReader.fromConfig(client, {
					packageId: config.packageId,
				});
				setResult({
					status: "ready",
					handles: {
						network,
						config,
						client,
						address: adapter.address,
						adapter,
						signer,
						walrusWrite,
						walrusRead,
						seal,
						reader,
					},
					error: null,
				});
			} catch (error) {
				if (!cancelled) {
					setResult({ status: "error", handles: null, error });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [network, address]);

	return result;
}
