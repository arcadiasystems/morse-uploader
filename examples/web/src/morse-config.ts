export type MorseNetwork = "testnet" | "mainnet";

export const DEFAULT_NETWORK: MorseNetwork = "testnet";

// morse-sdk ships mainnet addresses from 0.5.0 on, so both networks work.
// Encrypted files on mainnet additionally need a Seal credential; see
// SEAL_API_KEY below.
export const MAINNET_ENABLED = true;

// Optional dedicated RPC. The wallet (dapp-kit, JSON-RPC) and the SDK (gRPC)
// should resolve the same node, or object versions can skew and the certify
// step fails on the public load-balanced endpoint. Set both to one node (a
// dedicated provider or a local fullnode) for reliable uploads. Leave unset to
// use the public testnet RPC. See the example README.
export const SUI_JSONRPC_URL: string | undefined =
	import.meta.env.VITE_SUI_JSONRPC_URL || undefined;
export const SUI_GRPC_URL: string | undefined =
	import.meta.env.VITE_SUI_GRPC_URL || undefined;

// Direct write mode: the user's wallet pays for and signs the upload (no
// publisher). In a browser the write goes through Walrus's upload relay, which
// fans slivers out to storage nodes on the user's behalf for a small tip.
// The host is per-network.
const UPLOAD_RELAY_HOSTS: Record<MorseNetwork, string> = {
	testnet: "https://upload-relay.testnet.walrus.space",
	mainnet: "https://upload-relay.mainnet.walrus.space",
};

export function uploadRelayHost(network: MorseNetwork): string {
	return UPLOAD_RELAY_HOSTS[network];
}

// Ceiling on the relay tip we will pay, in MIST. The relay's real tip comes
// from its tip-config endpoint; this is just our maximum. Mainnet prices it
// linearly in encoded size and a small blob already costs ~2.6M MIST, so a
// testnet-sized cap would refuse every mainnet upload.
export const UPLOAD_RELAY_TIP_MAX_MIST = 10_000_000;

// Seal key servers for encrypted files. Testnet pins an open set, so this is
// only needed on mainnet, where every operator is commercial.
//
// WARNING: anything in a browser bundle is visible to whoever opens devtools.
// This is fine for a local demo with a throwaway key; a real app should proxy
// the credential through its own backend instead of shipping it.
export const SEAL_API_KEY: string | undefined =
	import.meta.env.VITE_SEAL_API_KEY || undefined;

// Walrus max_epochs_ahead is 53 on both testnet and mainnet (per the Walrus
// docs). Only the epoch duration differs (testnet 1 day, mainnet 2 weeks),
// which the UI reads from chain.
export const MAX_EPOCHS_AHEAD = 53;
