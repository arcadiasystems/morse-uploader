# Changelog

All notable changes to `@arcadiasystems/morse-uploader` will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-10

Mainnet support, via `@arcadiasystems/morse-sdk` 0.8.1.

### Changed

- **Peer dependency moves to `>=0.8.1 <0.9.0`** from `>=0.4.2 <0.5.0`. Nothing in the SDK's public surface broke across those four minors; the change that matters is that `morseConfig({ network: "mainnet" })` returns a real config instead of throwing, which is what kept this package on testnet.
- **`handles.seal` is now `SealAdapter | null`.** It is `null` when no Seal key servers are available, which on mainnet means no credential was supplied.

  Nullable rather than failing setup, deliberately: the adapter used to be built unconditionally, so under SDK 0.6.0+ the whole `useMorseFiles` hook would throw on mainnet and take the unencrypted flows down with it. Unencrypted upload and download now keep working, and the encrypted hooks reject with a message naming `sealKeyServers`. Consumers touching `handles.seal` directly get a type error rather than a runtime surprise.

### Added

- **`sealKeyServers`** on `useMorseFiles` / `MorseFilesProvider`, for supplying your own key servers. Needed on mainnet, where every operator is commercial and `morseConfig` therefore pins none; start from the SDK's `MAINNET_SEAL_COMMITTEE` and add the credential your operator issues.
- **`seal`** option for a prebuilt adapter, overriding `sealKeyServers`. This matches how `walrusWrite` and `walrusRead` already worked; Seal was the one adapter with no escape hatch.
- **`VITE_SEAL_API_KEY` in the example**, wiring Mysten's committee for encrypted mainnet files, with a warning in both the example README and the config that a credential in a browser bundle is visible to anyone who opens devtools and belongs behind a backend proxy in anything deployed.
- `docs-gate`, run by `prepublishOnly`, failing when the CHANGELOG's newest entry does not match `package.json` or when the README's "built on morse-sdk X.Y" claim does not match the peer range. That second rule exists because this package sat four minors behind its own README.
- `resolveSealServers`, exported and unit-tested, holding the "consumer's servers, else the config's, else none" decision so the hook stays thin.

### Fixed

- **A truncated share link was treated as a public file.** The Seal prefix and nonce are a pair, but `parseShareLink` only checked them together when both were present: a link that lost one of them (a chat client clipping the URL, a hand-edited fragment) parsed as a public file, so `useFileDownload` skipped decrypt and the UI showed raw ciphertext as if it were the file, with no error anywhere. A link carrying only one of the two, or either one in unparseable hex, is now `null` like any other damaged link.
- **`hexToBytes` silently corrupted bad input.** It leaned on `Number.parseInt` plus TypedArray's NaN-to-0 coercion, so `"zzzz"` decoded to `[0, 0]` and an odd-length `"abc"` to `[171]` with the trailing nibble dropped. Both produced a plausible byte array that failed much later inside Seal's decrypt, pointing nowhere near the cause. It now throws on non-hex digits and on an odd digit count.
- **The native file input was visible inside the styled dropzone.** It carried `.mu-input`, the class for visible text fields, so the browser's default "Choose file" control rendered on top of the drop target. It now has its own `.mu-file-input` class and is visually hidden while staying clickable and in the accessibility tree.
- **The cached Seal `SessionKey` survived a wallet switch.** `useFileDecrypt` cleared it only on a session-expired error, so after connecting a different account the hook kept signing reads with the previous account's session. The cache is now keyed by address and package and re-signs when either changes.
- **The example app was hardwired to testnet.** `MAINNET_ENABLED` was `false` with a note to flip it once the SDK shipped mainnet; the upload relay host was a testnet constant; the dapp-kit providers only registered testnet; and its own morse-sdk pin was still 0.4.2, so importing anything newer failed the Vite build. All four are fixed, and the relay host is now per-network.
- **The example's relay tip ceiling would have refused every mainnet upload.** It was 1,000,000 MIST, sized for testnet's flat tip. Mainnet prices the tip linearly in encoded size and a small blob already costs about 2,600,000, so `@mysten/walrus` would have rejected the upload before sending. Raised to 10,000,000.
- README claimed testnet only, described the package as built on SDK 0.4.0, and said `suix_queryEvents` was merely on a deprecation track. Public fullnodes have since retired it, so an event source now means Sui GraphQL or a dedicated indexer.

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
