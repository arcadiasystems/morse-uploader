export type MorseNetwork = "testnet" | "mainnet";

export const DEFAULT_NETWORK: MorseNetwork = "testnet";

// morse-sdk 0.1.x is testnet only; morseConfig({ network: "mainnet" }) throws.
// Flip this once the SDK ships mainnet (and add a mainnet relay below + mainnet
// to the dapp-kit providers).
export const MAINNET_ENABLED = false;

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
