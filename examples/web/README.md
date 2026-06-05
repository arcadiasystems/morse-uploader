# morse-uploader example (web)

A Vite + React demo of `@arcadiasystems/morse-uploader` on the morse-sdk 0.4.0
RecipientFile flow. Connect a Sui testnet wallet, flip the encrypt toggle, list
the recipient wallets that can decrypt (your own is always included), then
upload a file (public or encrypted) in two wallet popups. Your wallet pays for
and signs the upload to Walrus (direct mode via the testnet upload relay). The
app shows a share link; opening `#/f/<fileId>` renders the single-file
downloader, which decrypts in place for recipients.

The wallet needs a little testnet SUI (gas) and WAL (storage).

This app consumes the library's built `dist` through a Vite alias, so build the
library first.

## Run locally

From the repository root:

```sh
bun install
bun run build                  # build the library (dist/)
cd examples/web && bun run dev
```

For an active library-editing loop, run `bun run dev` (tsup watch) at the root
in one terminal and the command above in another.

## Build

```sh
bun run build:example          # builds the library, then the app -> examples/web/dist
```

## RPC (recommended for reliable uploads)

The wallet (dapp-kit) talks **JSON-RPC** and morse-sdk talks **gRPC**. On the
public load-balanced `fullnode.testnet.sui.io`, those two requests can hit
different backend nodes at different checkpoints, so the on-chain certify step
occasionally fails with an object-version conflict. Point both at **one node**
(a dedicated RPC provider or a local fullnode) to make uploads reliable.

Copy `.env.example` to `.env` and set both to the same node:

```sh
VITE_SUI_JSONRPC_URL=https://your-node/json-rpc
VITE_SUI_GRPC_URL=https://your-node/grpc
```

Leave them unset to use the public RPC (fine for a quick try; may intermittently
hit the version conflict).

## Deploy to Vercel

Create a Vercel project from this repository with:

- Root Directory: the repository root (not `examples/web`).
- Install Command: `bun install`
- Build Command: `bun run build:example`
- Output Directory: `examples/web/dist`
- Framework Preset: Vite (or Other).
- Environment Variables (optional, recommended): `VITE_SUI_JSONRPC_URL` and
  `VITE_SUI_GRPC_URL` pointed at one dedicated node.

## How it is wired

- `src/use-files-setup.ts` builds the files handles from the connected dapp-kit
  wallet via `useMorseFiles` (direct write path with the upload relay and the
  Walrus wasm URL).
- `src/components/Studio.tsx` is the home screen: an encrypt toggle reveals a
  "Who can access?" recipient list (built client-side, no signatures), then
  `MorseFileUploader` does the encrypted or public upload.
- `src/components/ConnectedApp.tsx` routes between the upload studio and the
  `MorseFileDownloader` based on the share-link hash.

Encryption here is scoped to a **per-file recipient set**: list the wallets that
should be able to decrypt (your own is always included) and upload. Only those
recipients can open the resulting share link.
