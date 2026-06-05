export type MorseNetwork = "testnet" | "mainnet";

export const DEFAULT_NETWORK: MorseNetwork = "testnet";

// morse-sdk 0.4.0 is testnet only; morseConfig({ network: "mainnet" }) throws.
// Flip this once the SDK ships mainnet (and add a mainnet relay below + mainnet
// to the dapp-kit providers).
export const MAINNET_ENABLED = false;

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
export const UPLOAD_RELAY_HOST = "https://upload-relay.testnet.walrus.space";

// Ceiling on the relay tip we will pay, in MIST. The relay's real tip comes
// from its tip-config endpoint; this is just our maximum.
export const UPLOAD_RELAY_TIP_MAX_MIST = 1_000_000;

// Walrus max_epochs_ahead is 53 on both testnet and mainnet (per the Walrus
// docs). Only the epoch duration differs (testnet 1 day, mainnet 2 weeks),
// which the UI reads from chain.
export const MAX_EPOCHS_AHEAD = 53;
