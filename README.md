# @arcadiasystems/morse-uploader

Generic, headless-first React file uploader for [Morse](https://github.com/arcadiasystems/morse-dcms) on Sui and Walrus. It uploads files to Walrus and, optionally, publishes them as Morse entries, signed by the user's connected browser wallet.

> Status: early development (0.x). Phase 0 ships framework-agnostic helpers; the headless hooks, primitives, and the optional default skin are landing incrementally. See the roadmap below.

## Why

- Headless-first: hooks and unstyled primitives you can restyle completely, plus an optional drop-in skin.
- Dependency-injected: you supply the network, wallet/signer, and adapters. Wallet connection stays in your app.
- Two upload modes, one component:
  - Simple (default): drop a file, get a Walrus CID and a shareable link. No publication required.
  - Morse entries (opt-in): pass a target (`publicationId` + `collectionName` + `publisherCapId`) and files become first-class Morse entries (named, listable, revisable, with expiry and encryption metadata).

## Install

```sh
npm install @arcadiasystems/morse-uploader
```

Peer dependencies (install in your app, pinned to the same ranges as `@arcadiasystems/morse-sdk` to avoid duplicate Sui/Walrus instances):

```sh
npm install react react-dom @arcadiasystems/morse-sdk \
  @mysten/sui @mysten/walrus @mysten/seal
```

`@mysten/seal` and `@mysten/walrus` are optional peers: you only need them for encryption and direct-Walrus writes respectively.

## Usage (available now)

```ts
import { buildShareUrl, formatBytes } from "@arcadiasystems/morse-uploader";

// App-URL link by default, aggregator fallback outside a browser.
buildShareUrl("aBcBlobId", { appBaseUrl: "https://app.example.com" });
// "https://app.example.com/f/aBcBlobId"

formatBytes(2_400_000); // "2.29 MB"
```

The upload hooks (`useMorseUploader`, `useMorseFiles`, `useEpochCostEstimate`, `useDecryptedBlob`), the headless primitives, and the themeable default skin are documented as each phase lands.

## Roadmap

- Phase 0: scaffold, framework-agnostic helpers, CI, contribution docs. (current)
- Phase 1: core upload + publish (simple and Morse modes; direct and custom-publisher writes), `useMorseUploader`.
- Phase 2: `useMorseFiles` listing + expiry computation.
- Phase 3: encrypt and decrypt (Seal).
- Phase 4: per-epoch cost estimate (WAL + SUI gas).
- Phase 5: headless primitives + optional default skin, full accessibility.
- Phase 6: release hardening, examples, opt-in live testnet e2e.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For vulnerabilities, see [SECURITY.md](./SECURITY.md); do not open public issues.

## License

MIT. See [LICENSE](./LICENSE).
