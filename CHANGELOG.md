# Changelog

All notable changes to `@arcadiasystems/morse-uploader` will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **A share link that lost its Seal material served an encrypted file as if it were public.** `useFileDownload` decided whether to decrypt from the link alone, so a link that arrived without its `p` and `n` parameters (a chat client trimming the fragment, a URL copied by hand, a link rebuilt from the file id) read the bytes straight from Walrus and handed back ciphertext as the file, with no error anywhere. `load` and `download` now first read the file's Seal prefix from chain with the SDK's `getRecipientFileSealPrefix`, the only reliable sign that a file is encrypted (`members` is not one, because the owner is always a member). A file with an on-chain prefix opened from a link without Seal material now fails with a `ShareLinkSealError` and serves nothing, and `MorseFileDownloader` shows "Link is incomplete" with "This file is encrypted, and the link is missing the details needed to decrypt it. Ask the sender for the full link."
- **A link whose Seal prefix is not the file's is refused before the wallet is asked to sign.** Such a link cannot decrypt the file, but it used to cost a SessionKey signature and then fail at the key servers with what reads as a permissions error, blaming the wallet for a damaged link. It now fails with `ShareLinkSealError` reason `"mismatch"`, shown as "Link does not match this file". The on-chain prefix is deliberately not substituted for the link's: the nonce is not on chain, so a link with one damaged field cannot be told apart from a link to a different file, and the uploader already refuses half-damaged links rather than guessing (see 0.2.0's `parseShareLink` fix).

  A file with no on-chain prefix behaves as before. Files encrypted before the prefix was stored on chain have none, and their links still carry the Seal material, so a missing prefix does not prove a file is public and the link still decides.

  The prefix is read only when the bytes are fetched, so a page that renders just the metadata pays nothing extra; a public download costs one more round trip and an encrypted one two. The read is aborted when the component unmounts, and an aborted fetch stops before reading bytes or prompting the wallet.

### Added

- **`downloadErrorMessage(error)`**, used by `MorseFileDownloader` and exported for custom UIs built on `useFileDownload`. It titles a `ShareLinkSealError` by its reason and defers everything else to the SDK's `formatUserMessage`, which would title it "Unexpected error".
- **`ShareLinkSealError`**, with `reason: ShareLinkSealErrorReason` (`"missing" | "mismatch"`). `useFileDownload` sets it as `error` when the link cannot open an encrypted file.

## [0.3.0] - 2026-10-18

Moves to `@arcadiasystems/morse-sdk` 0.9 and the Mysten lines it requires. The public API is unchanged. This is a minor bump because the new peer ranges exclude every version 0.2.x accepted, so upgrading means upgrading the SDK and all three Mysten packages with it.

### Changed

- **Peer dependencies.** `@arcadiasystems/morse-sdk` `>=0.9.0 <0.10.0` (was `>=0.8.1 <0.9.0`), `@mysten/sui` `>=2.36.0 <2.37.0` (was `>=2.16.2 <2.17.0`), `@mysten/walrus` `>=1.2.35 <1.3.0` (was `>=1.1.6 <1.2.0`), `@mysten/seal` `>=1.5.0 <1.6.0` (was `>=1.1.3 <1.2.0`). These are the SDK's own peer ranges, so an app resolves one copy of each. The README peer install is now `npm install react react-dom @arcadiasystems/morse-sdk@~0.9.0 @mysten/sui@~2.36.0 @mysten/walrus@~1.2.35 @mysten/seal@~1.5.0`.
- **`useFileDecrypt` now checks that the signer belongs to the session address itself.** `@mysten/seal` 1.5 removed that check from `SessionKey.create` to support address aliases. `useFileDecrypt` caches the session per address, so handles whose `signer` and `address` disagree would have cost a wallet popup, failed at the key servers, and stayed cached, failing every later decrypt for that address the same way. The hook now rejects before creating the session, with the same `UserError` class and leading message Seal used to throw, and without prompting the wallet or caching anything. Behaviour therefore matches 0.2.x. Handles from `useMorseFiles` always agree, because the SDK's `WalletStandardSigner` requires the account key to derive to its address, so only hand-built handles can reach the check. A signer whose key is an alias of the address stays unsupported, as it was before.
- **Everything else upstream changed needs nothing from consumers.** Seal 1.3 turned `verifyKeyServers` off by default, but the uploader always builds Seal through the SDK's `DefaultSealAdapter`, which now sets it to `true`, so key servers are still verified on first use. The `@mysten/sui` 2.26 `ObjectError` change is absorbed by the SDK's reader. The insufficient-balance text `uploadErrorMessage` rewrites is unchanged in sui 2.36, and walrus 1.2.35 still types the relay's `sendTip` as `{ max: number }`, so the README's `sendTip: { max: 10_000_000 }` stands.
- **The example** pins the same versions, plus `@mysten/dapp-kit` 1.1.17 and `@mysten/walrus-wasm` 0.3.1, the line walrus 1.2.35 uses. dapp-kit 1.1.17 is the last release of that package: Mysten has deprecated it because it supports JSON-RPC only, so the README's note on pointing it at a JSON-RPC endpoint still applies.

## [0.2.1] - 2026-10-17

README fixes only. The README ships in the package, so these needed a release; no code changed.

### Fixed

- **"Notes on Walrus" still said mainnet was unsupported** and told readers to pass `network: "testnet"`. Morse has run on Walrus Mainnet since 2026-09-09, and "Limitations and roadmap" in the same README already said so. The stale line is gone.
- **The peer install named no versions**, so it pulled the latest majors of `@arcadiasystems/morse-sdk` and `@mysten/*`, outside `peerDependencies`. It now pins each to the tilde range equivalent to its peer range: `@arcadiasystems/morse-sdk@~0.8.1 @mysten/sui@~2.16.2 @mysten/walrus@~1.1.6 @mysten/seal@~1.1.3`.
- **The upload relay example would have been refused on Walrus Mainnet.** It had no `sendTip`, and `@mysten/walrus` sends no tip without one, while the Walrus Mainnet relay requires a tip. The example now passes `sendTip: { max: 10_000_000 }` (0.01 SUI), the cap `examples/web` uses.

## [0.2.0] - 2026-09-10

Mainnet support, via `@arcadiasystems/morse-sdk` 0.8.1.

### Changed

- **Peer dependency moves to `>=0.8.1 <0.9.0`** from `>=0.4.2 <0.5.0`. Nothing in the SDK's public surface broke across those four minors; the change that matters is that `morseConfig({ network: "mainnet" })` returns a real config instead of throwing, which is what kept this package on testnet.
- **`handles.seal` is now `SealAdapter | null`.** It is `null` when no Seal key servers are available, which on mainnet means no credential was supplied.

  Nullable rather than failing setup, deliberately: the adapter used to be built unconditionally, so under SDK 0.6.0+ the whole `useMorseFiles` hook would throw on mainnet and take the unencrypted flows down with it. Unencrypted upload and download now keep working, and the encrypted hooks reject with a message naming `sealKeyServers`. Consumers touching `handles.seal` directly get a type error rather than a runtime surprise.

### Added

- **`network` on `buildShareLink` and `parseShareLink`**, written into the link's fragment as `net`. `useFileUpload` fills it in from the provider's network, so `shareLink` is now self-describing.
- **`uploadErrorMessage(error, network)`**, used by `MorseFileUploader` and exported for custom UIs. An insufficient-balance failure reaches the SDK as `@mysten/sui`'s raw text, so it rendered as "Network issue" followed by a coin type, an address, and two unscaled integers. It now reads "Not enough WAL. This upload needs 0.016626709 WAL and the connected wallet has 0 WAL." plus how to top up on that network. Everything else still goes through the SDK's `formatUserMessage`.
- **`sealKeyServers`** on `useMorseFiles` / `MorseFilesProvider`, for supplying your own key servers. Needed on mainnet, where every operator is commercial and `morseConfig` therefore pins none; start from the SDK's `MAINNET_SEAL_COMMITTEE` and add the credential your operator issues.
- **`seal`** option for a prebuilt adapter, overriding `sealKeyServers`. This matches how `walrusWrite` and `walrusRead` already worked; Seal was the one adapter with no escape hatch.
- **`VITE_SEAL_API_KEY` in the example**, wiring Mysten's committee for encrypted mainnet files, with a warning in both the example README and the config that a credential in a browser bundle is visible to anyone who opens devtools and belongs behind a backend proxy in anything deployed.
- `docs-gate`, run by `prepublishOnly`, failing when the CHANGELOG's newest entry does not match `package.json` or when the README's "built on morse-sdk X.Y" claim does not match the peer range. That second rule exists because this package sat four minors behind its own README.
- `resolveSealServers`, exported and unit-tested, holding the "consumer's servers, else the config's, else none" decision so the hook stays thin.

### Fixed

- **A share link did not say which network the file was on.** A file id resolves on one network only, so opening a mainnet link in an app sitting on testnet reported "Could not load this file. The id may be wrong or the record may have been deleted" for a file that exists. Links now carry `net`, `parseShareLink` returns it as `network`, and the example follows it instead of its own default. A link without `net` parses with `network: null`, as does one naming a network this version does not know.
- **A truncated share link was treated as a public file.** The Seal prefix and nonce are a pair, but `parseShareLink` only checked them together when both were present: a link that lost one of them (a chat client clipping the URL, a hand-edited fragment) parsed as a public file, so `useFileDownload` skipped decrypt and the UI showed raw ciphertext as if it were the file, with no error anywhere. A link carrying only one of the two, or either one in unparseable hex, is now `null` like any other damaged link.
- **`hexToBytes` silently corrupted bad input.** It leaned on `Number.parseInt` plus TypedArray's NaN-to-0 coercion, so `"zzzz"` decoded to `[0, 0]` and an odd-length `"abc"` to `[171]` with the trailing nibble dropped. Both produced a plausible byte array that failed much later inside Seal's decrypt, pointing nowhere near the cause. It now throws on non-hex digits and on an odd digit count.
- **The native file input was visible inside the styled dropzone.** It carried `.mu-input`, the class for visible text fields, so the browser's default "Choose file" control rendered on top of the drop target. It now has its own `.mu-file-input` class and is visually hidden while staying clickable and in the accessibility tree.
- **The cached Seal `SessionKey` survived a wallet switch.** `useFileDecrypt` cleared it only on a session-expired error, so after connecting a different account the hook kept signing reads with the previous account's session. The cache is now keyed by address and package and re-signs when either changes.
- **The example's network switcher did not move dapp-kit.** It drove only the SDK handles, while dapp-kit stayed on its default network, and dapp-kit's client is the one that resolves coins and serializes the transaction for the wallet. Switching to mainnet therefore built a mainnet transaction against the testnet node, which failed with "Insufficient balance of ...::wal::WAL ... Available: 0" on a wallet holding plenty of mainnet WAL. The switcher now calls dapp-kit's `selectNetwork`, and the provider's default comes from the same constant.
- **The example's network switcher did not move dapp-kit.** It drove only the SDK handles, while dapp-kit stayed on its default network, and dapp-kit's client is the one that resolves the coins a transaction spends. Switching to mainnet therefore resolved a mainnet transaction's coins on the testnet node, which failed with "Insufficient balance of ...::wal::WAL ... Available: 0" on a wallet holding plenty of mainnet WAL. The switcher now calls dapp-kit's `selectNetwork`, and the provider's default comes from the same constant.
- **The example could not sign a transaction on either network.** dapp-kit 1.0.6 serializes the transaction through its own JSON-RPC client, and Mysten's public fullnodes have retired JSON-RPC: the preflight answers without an `access-control-allow-origin` header, so the browser blocks the call and the upload fails with "Failed to fetch" before the wallet opens. The example now defaults to an endpoint that still serves JSON-RPC, overridable with `VITE_SUI_JSONRPC_URL`, and the limitation is documented for consumers wiring their own dapp-kit.
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
