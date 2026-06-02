# Changelog

All notable changes to `@arcadiasystems/morse-uploader` will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold: ESM build (tsup), strict TypeScript, Biome, Vitest with a coverage gate, and CI.
- `useMorseFiles` + `listUserFiles` / `listCollectionFiles` / `listOwnedFiles`: list a user's files, scoped to a collection or to all publications an address owns. The provider context now accepts an optional `reader` and `address`.
- Expiry toolkit: `computeExpiry` (pure end-epoch to wall-clock), plus `fetchEpochSchedule` and `fetchBlobEndEpoch` resolvers over a structural Walrus client surface. Byte size and expiry are not on-chain on an entry, so resolve expiry separately.
- `MorseUploaderProvider` + `useMorseUploaderContext`: dependency-injection context for the injected SDK deps (config, walrus adapter, optional wallet adapter) and upload defaults (epochs, target, share-link options). The host owns wallet connection.
- `useMorseUploader`: hook to upload a single file with status, progress phase, result, error, and a computed share link; composes `uploadFile` and `buildShareUrl`.
- `computeShareUrl` and `DEFAULT_EPOCHS` helpers.
- Optional `WalletStandardAdapter` helper (separate entry `@arcadiasystems/morse-uploader/wallet-standard`): a browser `WalletAdapter` backed by a wallet sign-and-execute callback, so consumers do not hand-copy it. Depends only on morse-sdk and @mysten/sui (no dapp-kit); wallet-connection wiring stays in the host app.
- `uploadFile`: core upload orchestrator. Simple blob mode (no target), plus Morse-entry mode in both the direct flow-capable path (`addEntryFromBytes`) and the custom-publisher two-step path (`uploadBlob` + `addEntry`), with forwarded or synthesized progress phases.
- `buildShareUrl`: build a shareable link for an uploaded blob from an app URL (with an aggregator fallback).
- `formatBytes`: human-readable byte formatting.
- `resolveOrigin`: SSR-safe browser origin lookup.
- Contribution, security, and code-of-conduct docs for public collaboration.
