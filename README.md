# @arcadiasystems/morse-uploader

Headless-first React components and hooks for encrypted file sharing on Sui and Walrus, built on [`@arcadiasystems/morse-sdk`](https://github.com/arcadiasystems/morse-dcms) 0.9. Upload a file to Walrus, optionally encrypt it for a set of recipient wallets so only they can decrypt, and share a link. The connected wallet pays for and signs everything.

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
npm install react react-dom @arcadiasystems/morse-sdk@~0.9.0 @mysten/sui@~2.36.0 @mysten/walrus@~1.2.35 @mysten/seal@~1.5.0
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
    // The relay host is per-network: swap testnet for mainnet when you do.
    walrusWriteConfig: {
      wasmUrl: walrusWasmUrl,
      uploadRelay: {
        host: "https://upload-relay.testnet.walrus.space",
        // Caps the per-upload tip the Walrus Mainnet relay charges, in MIST (0.01 SUI).
        sendTip: { max: 10_000_000 },
      },
    },
    // On mainnet, encrypted files also need your own Seal key servers.
    // See "Seal on mainnet" below. Omit on testnet.
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

### Rendering an upload error

`uploadErrorMessage(error, network)` returns the SDK's `{ title, description, cause }` for any failure, with one rewrite: an insufficient-balance failure arrives as raw `@mysten/sui` text (a coin type, an address, two unscaled integers) that the SDK can only classify as a network problem. This restates it as "Not enough WAL", with the amounts in whole coins and the network's way of topping up. `MorseFileUploader` already uses it; call it directly if you render your own errors.

## How encryption works

Each file is a **RecipientFile** that carries its own recipient set on chain (there is no separate allowlist object). You pass the recipients at upload time; the connected wallet is **auto-added**, so the owner can always decrypt. The upload helper encrypts under a random Seal identity and binds it to the file in a single transaction, so an encrypted upload to any number of recipients is just **2 wallet popups**. At decrypt time, Seal's key servers dry-run the file's recipient check on-chain; non-recipients cannot get the key.

Building the recipient list is entirely client-side (no signature per recipient). To change recipients after upload, the SDK exposes owner-only `addRecipient` / `removeRecipient` (not wired into this package's UI).

## Share links

`buildShareLink({ fileId, network, sealIdPrefix, sealNonce })` produces a `#/f/<fileId>?net=<network>&p=<hex>&n=<hex>` link. Pass `network`: a file id resolves on one network only, so a link without it opens against whatever network the receiving app happens to be on and reports the file as missing. The fileId and Seal material live in the URL **fragment**, so they never reach a server log. The Seal material is not a secret: decryption is still gated by the file's recipient set. Parse it back on your download route:

```tsx
import { parseShareLink } from "@arcadiasystems/morse-uploader";
const parsed = parseShareLink(window.location.href);
// { fileId, network, sealIdPrefix, sealNonce } | null  (prefix/nonce null for public files)
```

`null` means the link is not one of ours or is damaged. A link carrying only one of `p` / `n`, or either one in unparseable hex, is `null` too rather than a public file: reporting it as public would make the download path skip decrypt and hand the user raw ciphertext.

## Wallet popups

- **Public or encrypted upload**: two popups (Walrus `register_blob`, then a combined certify + create-RecipientFile PTB). Adding recipients is free (client-side).
- **Decrypt**: one popup to create a reusable Seal `SessionKey` (good for `ttlMin` minutes across any file you can access), then no popup per decrypt.

## Notes on Walrus

- Storage is a **lease**, capped at 53 epochs ahead on both networks. An epoch is ~1 day on testnet and ~2 weeks on mainnet.
- Blobs are raw bytes with no filename or MIME type; this package stores the name and content type in the on-chain file record so downloads come back correctly named and typed.

## Seal on mainnet

Encrypted files need Seal key servers. Testnet pins an open set, so nothing is
required there. Mainnet pins none: every mainnet Seal operator is commercial,
so you bring your own credential.

```tsx
import { MAINNET_SEAL_COMMITTEE } from "@arcadiasystems/morse-sdk";

const handles = useMorseFiles({
  network: "mainnet",
  account,
  callbacks,
  sealKeyServers: MAINNET_SEAL_COMMITTEE.map((s) => ({
    ...s,
    apiKeyName: "X-API-Key",
    apiKey: import.meta.env.VITE_SEAL_API_KEY,
  })),
});
```

Pass a prebuilt `seal` adapter instead if you want full control; it overrides
`sealKeyServers`.

Without either, `handles.seal` is `null` rather than the hook failing. That is
deliberate: building the adapter eagerly would fail setup on mainnet and take
the unencrypted flows down with it. Check for `null` before offering encryption
in your UI.

**Do not ship the key in client-side code you do not control.** A browser bundle
exposes it to anyone who opens devtools. Proxy through your own backend if the
credential is not meant to be public.

## Limitations and roadmap

- **Listing a wallet's files needs an indexer (deferred).** A `RecipientFile` is a shared Sui object with no owner-indexable field, so there is no direct "list my files" query. morse-sdk ships pure reconciliation helpers (`reconcileRecipientFilesOwnedBy`, `reconcileRecipientFilesAccessibleBy`) that turn a raw event stream into the current file set, but it deliberately does not fetch events. A production listing requires a Sui event source (a dedicated indexer; `suix_queryEvents` has since been retired by public fullnodes, so an event source now means Sui GraphQL or a dedicated indexer). This package does not ship a listing UI yet for that reason; it is planned once an indexer is in place.
- **Seal material is not on-chain.** The Seal identity needed to decrypt (prefix + nonce) is persisted out-of-band (in the share link, here). It is not recoverable from the chain or from an event listing, so a future indexer-backed list can surface encrypted files' metadata but cannot, by itself, decrypt them; decryption still requires the share-link material. Persist `sealIdPrefix`/`sealNonce` in your own store if you need list-and-open UX.
- **dapp-kit needs a JSON-RPC endpoint that still exists.** This package talks gRPC, which the public fullnodes still serve. dapp-kit 1.1.17, the last `@mysten/dapp-kit` release (Mysten has [deprecated](https://sdk.mystenlabs.com/sui/migrations/sui-2.0/dapp-kit) it for this reason), talks JSON-RPC only, and Mysten's public fullnodes have retired it: the preflight answers without an `access-control-allow-origin` header, so a browser call fails with `TypeError: Failed to fetch` from `@mysten/sui/jsonRpc` while dapp-kit serializes the transaction, before the wallet opens. Point `SuiClientProvider` at an endpoint that still serves JSON-RPC (your own node, a provider, or a public one such as `https://sui-rpc.publicnode.com`). Nothing in this package changes; the failure is in the wallet layer.
- **RPC consistency (use a dedicated RPC).** The SDK builds/reads over a gRPC client while the wallet (dapp-kit) executes over its own JSON-RPC client. When those are different nodes, they can sit at different checkpoints, so the certify step occasionally fails with an object-version conflict ("needs to be rebuilt"). For reliable uploads, point both at one **dedicated RPC**: set dapp-kit's `SuiClientProvider` URL and pass a `SuiGrpcClient` on the matching endpoint via `useMorseFiles({ suiClient })`. This is an RPC-infrastructure property, not a bug in the package logic.
- **Mainnet works, but encrypted files there need your own Seal key servers.** Testnet pins an open allowlist, so `network: "testnet"` needs no setup. Mainnet pins none, because every mainnet Seal operator is commercial. Without `sealKeyServers`, `handles.seal` is `null`: unencrypted upload and download still work, and the encrypted hooks reject with a message saying so. See [Seal on mainnet](#seal-on-mainnet).
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
