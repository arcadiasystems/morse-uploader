/**
 * Optional browser WalletAdapter helper. Import from
 * "@arcadiasystems/morse-uploader/wallet-standard". Depends only on morse-sdk
 * and @mysten/sui (no dapp-kit); the wallet-connection wiring stays host-side.
 */

export type { WalletSignAndExecute } from "./types.js";
export { WalletStandardAdapter } from "./wallet-standard-adapter.js";
