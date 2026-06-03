# morse-uploader example (web)

A Vite + React demo of `@arcadiasystems/morse-uploader`. Connect a Sui testnet
wallet, drop a file, and your wallet pays for and signs the upload to Walrus
(direct mode via the testnet upload relay), then shows the CID and a link. No
publisher and no publication are involved.

The wallet needs a little testnet SUI (gas) and WAL (storage). To use a
publisher that pays instead, swap `DefaultWalrusWriteAdapter` for
`HttpPublisherWriteAdapter` in `src/use-morse-client.ts`.

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

## Deploy to Vercel

Create a Vercel project from this repository with:

- Root Directory: the repository root (not `examples/web`).
- Install Command: `bun install`
- Build Command: `bun run build:example`
- Output Directory: `examples/web/dist`
- Framework Preset: Vite (or Other).

## Going further

`src/use-morse-client.ts` shows the direct (user-pays) write path with a
`WalletStandardSigner` and the upload relay, plus a `WalrusClient` for the live
cost estimate. Encryption is intentionally not wired here: Morse/Seal encryption
is gated by a publication `PublisherCap` (access = cap holders), so it requires
a publication and a `seal` adapter, which is outside this publication-free
uploader. Publication-free encryption would mean app-managed client-side
encryption (not Seal), with no on-chain access control.
