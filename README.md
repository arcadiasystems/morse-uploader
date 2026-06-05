# @arcadiasystems/morse-uploader

Headless-first React components and hooks for encrypted file sharing on Sui and Walrus, built on [`@arcadiasystems/morse-sdk`](https://github.com/arcadiasystems/morse-dcms) 0.4.0. Upload a file to Walrus, optionally encrypt it for a set of recipient wallets so only they can decrypt, and share a link. The connected wallet pays for and signs everything.

- **Headless-first**: composable hooks for every step (`useMorseFiles`, `useFileUpload`, `useFileDownload`, `useFileDecrypt`, `useRecipientFile`), plus an optional styled component set.
- **Recipient-scoped encryption**: each file carries its own recipient set; an encrypted upload to N recipients is **2 wallet popups**, regardless of N. The connected wallet is always a recipient, so the owner can always decrypt. Public (unencrypted) uploads need no recipients.
- **Dependency-injected**: you supply the network, wallet callbacks, and (optionally) custom Walrus adapters. Wallet connection stays in your app.
- **Share links** carry the file id and Seal material in the URL fragment; decryption is still gated by the file's recipient set, so the link is not a secret.

## Install

```sh
npm install @arcadiasystems/morse-uploader
```

Peer dependencies (install in your app, pinned to the same ranges as `@arcadiasystems/morse-sdk` so you do not end up with duplicate Sui/Walrus/Seal instances):

```sh
npm install react react-dom @arcadiasystems/morse-sdk \
  @mysten/sui @mysten/walrus @mysten/seal
```

## Quick start

### 1. Build the handles from your wallet

`useMorseFiles` turns a connected wallet into the SDK handles every other hook and component consumes. Wallet connection is your app's concern (this example uses [`@mysten/dapp-kit`](https://sdk.mystenlabs.com/dapp-kit)). Call it only when a wallet is connected, then wrap your tree in `MorseFilesProvider`.

```tsx
import { useMorseFiles, MorseFilesProvider } from "@arcadiasystems/morse-uploader";
import {
  useCurrentAccount,
  useSignTransaction,
  useSignPersonalMessage,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import walrusWasmUrl from "@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url";

function FilesApp({ account }) {
  const { mutateAsync: signTransaction } = useSignTransaction();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const setup = useMorseFiles({
    network: "testnet",
    account,
    callbacks: {
      signTransaction: ({ transaction }) => signTransaction({ transaction }),
      signPersonalMessage: ({ message }) => signPersonalMessage({ message }),
      signAndExecuteTransaction: ({ transaction }) =>
        signAndExecuteTransaction({ transaction }),
    },
    // Optional: pass a SuiGrpcClient on a dedicated RPC so reads/builds resolve
    // the same chain state your wallet executes against (see "Limitations").
    // Defaults to a gRPC client on the network's public RPC.
    // suiClient: new SuiGrpcClient({ network: "testnet", baseUrl: DEDICATED_RPC_URL }),
    // Browser direct writes go through the Walrus upload relay and need the wasm URL.
    walrusWriteConfig: {
      wasmUrl: walrusWasmUrl,
      uploadRelay: { host: "https://upload-relay.testnet.walrus.space" },
    },
  });

  if (setup.status !== "ready" || setup.handles === null) {
    return <p>Preparing your wallet...</p>;
  }

  return (
    <MorseFilesProvider value={setup.handles}>
      {/* hooks and components below */}
    </MorseFilesProvider>
  );
}
```

### 2. Drop in the components

Import the styled components from the `/ui` entry and the stylesheet once:

```tsx
import {
  MorseFileUploader,
  MorseFileDownloader,
} from "@arcadiasystems/morse-uploader/ui";
import "@arcadiasystems/morse-uploader/styles.css";

// Public upload:
<MorseFileUploader onUploaded={(r) => console.log(r.shareLink)} />

// Encrypted upload to specific recipients (the connected wallet is always added):
<MorseFileUploader
  encrypt
  recipients={["0xbob...", "0xcarol..."]}
  onUploaded={(r) => console.log(r.shareLink, r.sealIdPrefix, r.sealNonce)}
/>

// Single-file viewer/downloader for a share link:
<MorseFileDownloader fileId={fileId} sealIdPrefix={prefix} sealNonce={nonce} />
```

Theme by overriding the `--mu-*` CSS variables (e.g. `--mu-accent-color`, `--mu-surface-color`, `--mu-fg-color`) on any ancestor, or restyle the `mu-*` classes directly.

## Headless hooks

All hooks must be used inside `MorseFilesProvider`.

| Hook | Purpose |
|---|---|
| `useMorseFiles(options)` | Build the handles from a connected wallet. Used once, above the provider. |
| `useFileUpload()` | Upload one file: `upload({ file, epochs, recipients?, encrypt? })`. Encrypted when `encrypt` is set. Returns `{ fileId, blobId, encrypted, sealIdPrefix, sealNonce, shareLink }` and exposes a phase stepper. |
| `useFileDownload(fileId, seal)` | Drive a download page: loads metadata, then `load()` / `download()` reads (public, `seal` null) or decrypts (encrypted, `seal` = `{ sealIdPrefix, sealNonce }`). |
| `useFileDecrypt()` | Lower-level decrypt: `decrypt({ file, sealIdPrefix, sealNonce })` returns plaintext bytes (one SessionKey signature, reused across files). |
| `useRecipientFile(fileId)` | Load a `RecipientFile`'s on-chain metadata (name, contentType, size, members, blobId). |
| `useStorageCostEstimate({ sizeBytes, epochs, encrypt })` | USD storage-cost estimate using Walrus [predictable pricing](https://blog.walrus.xyz/announcing-predictable-pricing-in-usd-on-walrus/) ($0.023/GB/month). |
| `useDropzone(options)` | Generic headless drag-and-drop file selection (prop-getters). |
| `useClipboard(resetMs?)` | Copy text and flag `copied` for a short window (for "Copy link" buttons). |

## How encryption works

Each file is a **RecipientFile** that carries its own recipient set on chain (there is no separate allowlist object). You pass the recipients at upload time; the connected wallet is **auto-added**, so the owner can always decrypt. The upload helper encrypts under a random Seal identity and binds it to the file in a single transaction, so an encrypted upload to any number of recipients is just **2 wallet popups**. At decrypt time, Seal's key servers dry-run the file's recipient check on-chain; non-recipients cannot get the key.

Building the recipient list is entirely client-side (no signature per recipient). To change recipients after upload, the SDK exposes owner-only `addRecipient` / `removeRecipient` (not wired into this package's UI).

## Share links

`buildShareLink({ fileId, sealIdPrefix, sealNonce })` produces a `#/f/<fileId>?p=<hex>&n=<hex>` link. The fileId and Seal material live in the URL **fragment**, so they never reach a server log. The Seal material is not a secret: decryption is still gated by the file's recipient set. Parse it back on your download route:

```tsx
import { parseShareLink } from "@arcadiasystems/morse-uploader";
const parsed = parseShareLink(window.location.href);
// { fileId, sealIdPrefix, sealNonce } | null  (prefix/nonce null for public files)
```

## Wallet popups

- **Public or encrypted upload**: two popups (Walrus `register_blob`, then a combined certify + create-RecipientFile PTB). Adding recipients is free (client-side).
- **Decrypt**: one popup to create a reusable Seal `SessionKey` (good for `ttlMin` minutes across any file you can access), then no popup per decrypt.

## Notes on Walrus

- Storage is a **lease**, capped at 53 epochs ahead on both networks. An epoch is ~1 day on testnet and ~2 weeks on mainnet.
- Blobs are raw bytes with no filename or MIME type; this package stores the name and content type in the on-chain file record so downloads come back correctly named and typed.
- Mainnet is not yet supported by the SDK; pass `network: "testnet"`.

## Limitations and roadmap

- **Listing a wallet's files needs an indexer (deferred).** A `RecipientFile` is a shared Sui object with no owner-indexable field, so there is no direct "list my files" query. morse-sdk 0.4.0 ships pure reconciliation helpers (`reconcileRecipientFilesOwnedBy`, `reconcileRecipientFilesAccessibleBy`) that turn a raw event stream into the current file set, but it deliberately does not fetch events. A production listing requires a Sui event source (a dedicated indexer; the legacy `suix_queryEvents` path works today but is on Mysten's deprecation track). This package does not ship a listing UI yet for that reason; it is planned once an indexer is in place.
- **Seal material is not on-chain.** The Seal identity needed to decrypt (prefix + nonce) is persisted out-of-band (in the share link, here). It is not recoverable from the chain or from an event listing, so a future indexer-backed list can surface encrypted files' metadata but cannot, by itself, decrypt them; decryption still requires the share-link material. Persist `sealIdPrefix`/`sealNonce` in your own store if you need list-and-open UX.
- **RPC consistency (use a dedicated RPC).** The SDK builds/reads over a gRPC client while the wallet (dapp-kit) executes over its own JSON-RPC client. On the public, load-balanced `fullnode.testnet.sui.io`, those two requests can hit different backend nodes at different checkpoints, so the certify step occasionally fails with an object-version conflict ("needs to be rebuilt"). For reliable uploads, point both at a **dedicated RPC**: set dapp-kit's `SuiClientProvider` URL and pass a `SuiGrpcClient` on the matching endpoint via `useMorseFiles({ suiClient })`. This is an RPC-infrastructure property, not a bug in the package logic.
- **Testnet only.** `network: "mainnet"` will work the moment the SDK ships mainnet addresses; until then pass `"testnet"`.
- **Storage is a lease.** Walrus storage is capped at 53 epochs ahead and expires; this is not permanent storage.

## Example

A deployable Vite + React example lives in [`examples/web`](./examples/web). Build the library first (`bun run build` at the repo root), then `bun run dev` in the example.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). In short: one function/component per file, logic in hooks (components stay presentational), no inline styles, and tests for everything. Run the full gate before opening a PR:

```sh
bun run lint && bun run typecheck && bun run test:coverage && bun run build && bun run check:exports
```

## License

[MIT](./LICENSE)
