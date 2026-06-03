# @arcadiasystems/morse-uploader

Generic, headless-first React file uploader for [Morse](https://github.com/arcadiasystems/morse-dcms) on Sui and Walrus. Upload files to Walrus and, optionally, publish them as Morse entries, signed by the user's connected browser wallet.

- **Headless-first**: hooks and unstyled primitives you can restyle completely, plus an optional drop-in skin.
- **Dependency-injected**: you supply the network, wallet/signer, and adapters. Wallet connection stays in your app, so the component is network-agnostic (testnet today; mainnet the moment the SDK supports it).
- **Two upload modes, one component**:
  - Simple (default): drop a file, get a Walrus content id (CID) and a shareable link. No publication required.
  - Morse entries (opt-in): pass a target (`publicationId` + `collectionName` + `publisherCapId`) and files become first-class Morse entries (named, listable, encryptable).

## Install

```sh
npm install @arcadiasystems/morse-uploader
```

Peer dependencies (install in your app, pinned to the same ranges as `@arcadiasystems/morse-sdk` so you do not end up with duplicate Sui/Walrus instances):

```sh
npm install react react-dom @arcadiasystems/morse-sdk \
  @mysten/sui @mysten/walrus @mysten/seal
```

`@mysten/seal` and `@mysten/walrus` are optional peers: you only need `@mysten/seal` for encrypt/decrypt and `@mysten/walrus` for direct writes and the cost estimate.

## Quick start

The component reads everything it needs from a context value you build once from your connected wallet. Wallet connection is your app's concern (this example uses [`@mysten/dapp-kit`](https://sdk.mystenlabs.com/dapp-kit)).

### 1. Build the context value

```tsx
import {
  HttpAggregatorReadAdapter,
  HttpPublisherWriteAdapter,
  morseConfig,
  RpcPublicationReader,
} from "@arcadiasystems/morse-sdk";
import { WalletStandardAdapter } from "@arcadiasystems/morse-uploader/wallet-standard";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { useMemo } from "react";

export function useMorseClient() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  return useMemo(() => {
    if (!account) return null;
    const config = morseConfig({ network: "testnet" });
    const client = new SuiGrpcClient({ network: "testnet", baseUrl: config.rpcUrl });
    const adapter = new WalletStandardAdapter(
      account.address,
      ({ transaction }) => signAndExecute({ transaction }),
      client,
    );
    return {
      config,
      client,
      adapter,
      reader: RpcPublicationReader.fromMorseConfig(config, client),
      walrusRead: HttpAggregatorReadAdapter.fromMorseConfig(config, client),
      walrus: HttpPublisherWriteAdapter.fromConfig({
        publisherUrl: "https://walrus-testnet-publisher.nami.cloud",
        ownerAddress: adapter.address,
      }),
      address: adapter.address,
      defaultEpochs: 12,
    };
  }, [account, signAndExecute]);
}
```

### 2a. Drop-in skin

```tsx
import { MorseUploaderProvider } from "@arcadiasystems/morse-uploader";
import { MorseUploader } from "@arcadiasystems/morse-uploader/ui";
import "@arcadiasystems/morse-uploader/styles.css";
import { useMorseClient } from "./use-morse-client";

export function App() {
  const value = useMorseClient();
  if (!value) return <p>Connect a wallet.</p>;
  return (
    <MorseUploaderProvider value={value}>
      <MorseUploader />
    </MorseUploaderProvider>
  );
}
```

### 2b. Your own UI (headless)

```tsx
import { useMorseUploader } from "@arcadiasystems/morse-uploader";

function MyUploader() {
  const { status, phase, data, error, upload } = useMorseUploader();
  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload({ file, epochs: 12 });
        }}
      />
      {status === "uploading" && <p>{phase}...</p>}
      {data && <a href={data.shareUrl ?? "#"}>{data.result.blobId}</a>}
      {error ? <p>Upload failed.</p> : null}
    </div>
  );
}
```

A full, themed example (dark mode, lucide icons, date picker, live cost, network switcher) lives in [`examples/web`](./examples/web).

## API

Default entry (`@arcadiasystems/morse-uploader`):

- **Provider/context**: `MorseUploaderProvider`, `MorseUploaderContext`, `useMorseUploaderContext`.
- **Hooks**: `useMorseUploader` (upload one file with status/phase/result), `useMorseFiles` (list a user's entries), `useEpochCostEstimate` (live WAL cost), `useDecryptedBlob` (Seal decrypt), `useDropzone` (headless drag-and-drop).
- **Primitives (unstyled)**: `Dropzone`, `EpochControl`, `EncryptToggle`, `CostEstimate`, `ProgressIndicator`, `FileList`, `WriteModeSettings`.
- **Core functions** (framework-agnostic, all deps injected): `uploadFile`, `decryptFile`, `listUserFiles` / `listCollectionFiles` / `listOwnedFiles`, `estimateEpochCost` / `estimateStorageCost`, `computeExpiry`, `fetchEpochSchedule`, `fetchBlobEndEpoch`, `buildShareUrl`.
- **Utils/constants**: `formatBytes`, `formatTokenAmount`, `computeShareUrl`, `resolveOrigin`, `entryToFile`, `DEFAULT_EPOCHS`, `DEFAULT_SESSION_TTL_MIN`, `DEFAULT_ENCRYPTION_OVERHEAD_BYTES`.

Other entries:

- `@arcadiasystems/morse-uploader/ui` -> `MorseUploader` (the default skin).
- `@arcadiasystems/morse-uploader/styles.css` -> the skin's themeable stylesheet (`--mu-*` variables, `mu-*` classes).
- `@arcadiasystems/morse-uploader/wallet-standard` -> `WalletStandardAdapter` (a browser `WalletAdapter`; depends only on morse-sdk and `@mysten/sui`, not dapp-kit).

## How it works

- **Simple mode** (no `target`): `walrus.uploadBlob` returns a CID. With a custom publisher the publisher pays storage, so the user signs nothing.
- **Morse-entry mode** (`target` provided): `addEntryFromBytes` on a flow-capable adapter, or `uploadBlob` + `addEntry` on a publisher. Set `encrypt: true` (needs a `seal` adapter) to publish an encrypted entry.
- **Cost**: `useEpochCostEstimate` reads the WAL storage cost from a `WalrusClient` (`walrusClient` on the context). SUI gas is not estimated here, because the publish PTB cannot be built before upload; pass `suiGasMist` if you have your own figure.
- **Expiry/duration**: Walrus storage is a finite lease, capped at `max_epochs_ahead` = 53 epochs on both testnet and mainnet (epoch duration: testnet 1 day, mainnet 2 weeks). There is no permanent storage. Convert a target date to epochs with `fetchEpochSchedule` + `computeExpiry`.

## Customization

The default skin is themeable via `--mu-*` CSS variables and `mu-*` classes. For full control, build your own UI from the hooks and primitives: components stay dumb, logic lives in the hooks, and there are no inline styles anywhere. Inject `labels` and `formatters` into the primitives for i18n and custom number/date formatting.

## Troubleshooting

- **`useMorseUploaderContext must be used within a MorseUploaderProvider`** — render your component (or the skin) inside `<MorseUploaderProvider value={...}>`.
- **`morseConfig({ network: "mainnet" })` throws** — morse-sdk is testnet-only today. Use `testnet`; the component itself is network-agnostic and will work on mainnet once the SDK supports it.
- **`uploadFile: encryption requires a target` / `requires a seal adapter`** — encryption produces a Morse entry, so it needs both a `target` and a `seal` adapter on the context. It is not available for target-free simple-blob uploads.
- **`useMorseFiles requires a reader` / `useDecryptedBlob requires seal, walrusRead, signer, client`** — those features need extra deps on the context. Add `reader` (listing), or `seal` + `walrusRead` + `signer` + `client` (decrypt). Simple uploads need none of them.
- **Cost estimate stays empty** — pass a `@mysten/walrus` `WalrusClient` as `walrusClient` on the context; the estimate is disabled without it.
- **`Failed to fetch` on read** — use `HttpAggregatorReadAdapter` (not `DefaultWalrusReadAdapter`) in browsers; the storage-node fan-out has CORS gaps. Aggregator reads are operator-trusted.
- **Upload fails against a public publisher** — public testnet publishers rate-limit and occasionally 5xx. Retry or point `publisherUrl` at another publisher.
- **`session-expired` during decrypt** — handled automatically: `decryptFile` re-signs a fresh `SessionKey` once and retries.
- **Bundler errors about wasm / top-level await** — `@mysten/walrus` ships wasm. In Vite add `vite-plugin-wasm` + `vite-plugin-top-level-await`; in Next.js add `transpilePackages: ["@mysten/walrus"]`.
- **Duplicate Sui/Walrus instances or version mismatches** — keep `@mysten/*` as single copies pinned to the same ranges as `@arcadiasystems/morse-sdk` (they are peer deps here, not bundled).
- **SSR (`window is not defined`)** — the package guards `window`/`document` and is side-effect-free; import the styles only in client code.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For vulnerabilities, see [SECURITY.md](./SECURITY.md); do not open public issues.

## License

MIT. See [LICENSE](./LICENSE).
