# Changelog

All notable changes to `@arcadiasystems/morse-uploader` will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-05

Built on `@arcadiasystems/morse-sdk` `>=0.4.2 <0.5.0` (0.4.0 failed every upload via a type-origin lookup bug; 0.4.1 broke `getRecipientFile` over the gRPC client via an `Option<ID>` parse bug; 0.4.2 is the floor): encrypted file sharing where each file (a `RecipientFile`) carries its own recipient set. `useMorseFiles` passes the full `morseConfig` output (including `recipientFileEventOriginPackageId`) to the upload helpers, which they need to match created objects by their type-origin package after a contract upgrade. An encrypted upload to N recipients is 2 wallet popups and the connected wallet is always a recipient (owner can always decrypt). The 0.4.0 SDK also ships pure event-reconciliation helpers for file listing; a listing UI is intentionally deferred here pending a production indexer (see README "Limitations and roadmap").

### Added

- Project scaffold: ESM build (tsup), strict TypeScript, Biome, Vitest with a coverage gate, and CI.
- `useMorseFiles`: setup hook that builds the SDK handles (Sui client, `WalletStandardAdapter`, `WalletStandardSigner`, Walrus read/write adapters, Seal adapter, `RpcRecipientFilesReader`) from a connected wallet, plus `MorseFilesProvider` / `useMorseFilesContext` to inject them. Accepts an optional `suiClient` (a `SuiGrpcClient`, e.g. on a dedicated RPC) for reads/builds; the `WalletStandardAdapter` also backfills created-object types via `getObject` when the receipt omits them.
- `useFileUpload`: upload one file, public or encrypted for a recipient set. Reports the upload phase stepper and returns `{ fileId, blobId, encrypted, sealIdPrefix, sealNonce, shareLink }`.
- `useFileDownload` + `useFileDecrypt`: load a file's metadata, then read (public) or decrypt (recipient, one reusable Seal SessionKey) the bytes with the correct filename and MIME type.
- `useRecipientFile`: load a `RecipientFile`'s on-chain metadata (name, contentType, size, members, blobId).
- `useStorageCostEstimate` + `estimateStorageUsd`: USD storage-cost estimate using Walrus predictable pricing ($0.023/GB/month) and the network's nominal epoch length.
- Share links: `buildShareLink` / `parseShareLink` carry the file id and Seal material (prefix + nonce) in the URL fragment (not a secret; decryption is gated by the file's recipient set).
- Optional styled components at `@arcadiasystems/morse-uploader/ui`: `MorseFileUploader` (driven by `encrypt` + `recipients` props), `MorseFileDownloader`, plus a themeable stylesheet at `@arcadiasystems/morse-uploader/styles.css` (`--mu-*` variables, `mu-*` classes). Components are presentational; all logic lives in the hooks.
- Headless `useDropzone` hook: drag-and-drop file selection via prop-getters (keyboard-operable, ARIA-labelled, drag state), no inline styles.
- Headless `useClipboard` hook: copy text and expose a `copied` flag that resets after a delay, powering the uploader's "Copy link" button.
- Optional `WalletStandardAdapter` helper (separate entry `@arcadiasystems/morse-uploader/wallet-standard`): a browser `WalletAdapter` backed by a wallet sign-and-execute callback. Depends only on morse-sdk and @mysten/sui.
- Utilities: `bytesToHex`, `hexToBytes`, `formatBytes`, `formatUsd`, `isPreviewableImage`, `triggerDownload`, `resolveOrigin`, `epochDurationMs`, `uploadPhases`, `uploadPhaseLabel`, and the `DEFAULT_ENCRYPTION_OVERHEAD_BYTES` constant.
- Contribution, security, and code-of-conduct docs for public collaboration.
