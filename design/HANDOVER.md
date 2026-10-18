# Morse Uploader, design handover

Morse Uploader is a non-custodial transfer client for Walrus: FileZilla in the browser, later a desktop app. It replaces the current uploader.morsecms.xyz demo and is positioned against Walrus Console, which is a hosted drive with Google sign-in, API keys and Console-managed payment. Uploader is the opposite on every axis: the wallet is the login, every transaction is signed by the user, limits are Walrus's own, and nothing is custodied.

## Revised MVP (supersedes the four-line proposal)

The original MVP was a drop zone with folder support, progress with blob id preview, folder structure and basic wallet publishing. All four are kept and are now the left pane plus the queue. What makes it "Console on steroids" is the right pane and the drawer:

1. Two panes, one queue. Local files on the left (drag and drop, folder picker), the wallet's Walrus blobs on the right, a transfer queue at the bottom that shows encode, upload, certify and record as separate steps per item, with speed, blob id as soon as it exists, retry with backoff, and a batch cost line.
2. Folders become quilts. Default is one quilt per dropped folder with paths kept; alternative is one blob per file. The upload sheet previews the resulting structure before anything is signed.
3. Cost before you sign. Encoded size, storage for the chosen period, write fee and gas, read from the Walrus system object at that moment, with balance-after. Periods are 30 days, 6 months, 1 year, 2 years mapped to epochs for the current network.
4. Blob management. Every blob the wallet owns: certified, encrypted, expiring, expired. Expiry bar per blob, extend one or extend all, auto-extend with a WAL cap, delete when deletable. Expired blobs stay listed with their Sui record.
5. Verify. Re-fetch slivers from storage nodes and check against the blob id, on demand, with the result and time shown in the drawer.
6. Share and publish. Aggregator link, Walrus Site link, embed snippet. Publish to Morse attaches a blob as an entry in a chosen publication and collection (one transaction), which is the bridge between the two products. Walrus Sites deploy from a quilt is a listed section, not a screen yet.
7. Seal per folder or file. Client-side encryption toggle in the upload sheet; encrypted items show a lock and decrypt on download for allowed wallets.
8. Agents and keys. An MCP server that talks to the same client with a wallet-scoped capability the owner can revoke (listed in the sidebar; screen not designed in this pass).

## Screens

| File | Screen |
|---|---|
| `index.html` | Landing: hero with the app shot, four feature cards, Console comparison table |
| `app.html` | App shell: top bar with profile and balances, sidebar, local and Walrus panes, active queue with five transfer states (certifying, uploading, queued, done, retrying) |
| `app-blob.html` | Blob drawer: preview, verification, record, storage with extend and auto-extend, publish to Morse, share, delete |
| `app-upload.html` | Upload sheet: tree preview, quilt or per-file, Seal and deletable toggles, period, itemised cost, also-publish toggle, sign count |
| `app-lowfunds.html` | Same shell with the WAL balance in warn state and "top up" in the top bar |

All five render at 1440 and 390 with no horizontal overflow. On mobile the local pane hides (uploads come from the share sheet or file picker), the Walrus pane fills the screen, and the queue shows name and progress only.

## Build notes

- Static client, no backend. Walrus writes through the browser SDK (@mysten/walrus) with Wallet Standard signing; reads through storage nodes for verify and through the public aggregator for speed. Seal via @mysten/seal. Morse attach via @arcadiasystems/morse-sdk.
- Each blob upload is two signatures (register, certify). The sheet says so, and the sign count is computed. One-signature batching is a desktop-app feature (sponsored or multi-command PTB), shown as a note, not promised in the browser.
- Confirm against the Walrus docs before the copy ships: max blob size (the design says 13 GiB), quilt limits (number of blobs per quilt and per-blob size inside a quilt), encoding overhead factor (the design uses about 4.8x), fee components (storage price per unit per epoch plus write fee), epochs per period on testnet versus mainnet.
- Queue steps map to SDK events: encode (client), upload (slivers to nodes or publisher), certify (certification tx), record (optional Morse entry tx). A failure in certify after upload must surface the blob object id and offer Finish, same pattern as Press.
- Profiles in the top bar are FileZilla's site manager: several wallets and networks, switch without disconnecting.
- Desktop app: Tauri wrapper of the same UI with a real filesystem on the left pane, resumable multi-GB uploads, background extend. Mark it as next on the landing; the "Download for Mac" button is dashed Coming.
- Sample data: all names, ids, sizes and dates are placeholders.
