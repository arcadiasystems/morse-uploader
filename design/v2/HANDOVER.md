# Morse Uploader, design handover (v2, concept A)

Morse Uploader is a non-custodial transfer client for Walrus. The wallet is the login, every transaction is signed by the user, limits are Walrus's own, nothing is custodied. It replaces the empty demo at uploader.morsecms.xyz and is positioned against Walrus Console, which is a hosted drive (Google or Apple sign-in, API keys, Console-managed WAL and auto-extend, 5 GB per space, five folders, 100 MiB per upload, Seal-encrypted private folders, an MCP server). This package supersedes the earlier two-pane design entirely.

## Visual language

Walrus-world, so the product sits naturally next to Walrus Memory and Console: near-black field `#07080B`, glass panels (white at 4 to 8 percent with backdrop blur), hairline borders at 9 and 16 percent white, mono uppercase labels with the `//` prefix on the landing, thin display type (Bricolage Grotesque 400) for the landing headline and 700 for app titles, Instrument Sans for body, IBM Plex Mono for ids, labels and numbers. The accent is Morse ultramarine `#2B3BE0` with its lift `#7D8BFF` on dark, and nothing else: no gradient, no cyan, no violet. Ultramarine fills the primary action and the active rail item; the lift carries links, selected states, progress and the storage bar. The Trace stays as the mark; glass tiles carrying it appear only on the landing and refract ultramarine into bone. Status colours are functional and muted: green verified or certified, amber expiring within 30 days, red failed or expired. The dark field, glass panels and mono labels are what place the product in Walrus's world; the colour is what keeps it Morse. All tokens are at the top of `dark.css`.

## The interface rethink

The earlier design copied FileZilla: a local pane, a remote pane and a permanent queue. In a browser the local pane only knows what was dropped, and the queue takes a quarter of the screen whether or not anything is moving. v2 is organised around what a Walrus user actually does: look at what they own, drop things, sign once, keep storage alive.

1. One workspace, not two panes. The main view is the wallet's Walrus objects. There is no local pane; dropping anywhere on the window puts files into the staging tray. The staging tray is the only upload path.
2. Stage, then sign. Drops accumulate in a tray (bottom right) showing each item, the live price, the four settings (keep for, encryption, folder handling, also publish) and one button, "Sign and send" with the signature count. Nothing uploads by surprise. The tray persists across reloads.
3. Transfers as a slide-over, not a dock. A pill in the top bar shows active transfers and remaining time and opens a panel with a summary strip (remaining, throughput, cost of this batch, signatures done) and per-item four-segment progress for encode, upload, certify, record. A failure shows the step, the retry countdown and Retry now.
4. Storage clock everywhere. Every row has a storage-left bar; the overview has a twelve-month expiry timeline; Expiring is a filter; the bulk bar and the command palette both offer "Extend everything expiring" with its cost. Expiry is the failure mode Console hides and the one that loses people data.
5. Quilts open in place. A quilt row expands to its files; the inspector lists files by path and offers Deploy as site and Add as entries to a Morse publication.
6. Inspector instead of a drawer. A persistent right column for the selection: actions, verification, storage with extend and auto-extend, record, files, publish, delete.
7. Bulk bar. Selecting rows raises a floating bar: Extend all with cost, Share, Verify, Publish, Delete.
8. Command palette (⌘K). Search and actions in one field: extend, auto-extend, go to a view, jump to a blob.
9. Overview is the home. Stored, paid-through, price now, the expiry timeline, a drop zone, recent activity including agent uploads, and what is published through Morse.

## Screens

| File | Screen |
|---|---|
| `index.html` | Landing in concept A: hero with glass tiles, app shot, four feature cards, Console comparison table |
| `app-overview.html` | Overview home |
| `app.html` | Files, a quilt expanded, inspector open on it |
| `app-drop.html` | Drop-anywhere state |
| `app-staging.html` | Staging tray with three items, settings and cost |
| `app-transfers.html` | Transfers slide-over with five item states (waiting for wallet, uploading, encoding, retrying, done) |
| `app-bulk.html` | Expiring filter with seven selected and the bulk bar |
| `app-palette.html` | Command palette on "extend" |

All render at 1440 and 390 with no horizontal overflow (`*-desktop.png`, `*-mobile.png` beside each file). On mobile the rail becomes a bottom tab bar, the search moves into the palette, the inspector becomes a full sheet, the tray and the transfers panel go full width, and rows keep name, size and the overflow menu.

## Build notes

- Stack: Next.js static export on Vercel, no backend. `@mysten/walrus` for reads and writes with Wallet Standard signing, `@mysten/seal` for encryption, `@arcadiasystems/morse-sdk` for Publish to Morse. Testnet first, network switch in the profile menu.
- Staging tray state persists in IndexedDB keyed by wallet address. Price is read from the Walrus system object when the tray opens and again immediately before signing; if it changed, the tray says so before the wallet prompt.
- Each blob is two signatures (register, certify). The tray shows the count. One-signature batching is a desktop-app feature, shown as a note, never promised in the browser.
- Transfer steps map to SDK events: encode (client), upload (slivers to nodes or publisher), certify (certification tx), record (optional Morse entry tx). A certify failure after upload keeps `blobObjectId` locally and offers Finish, so nothing is re-uploaded.
- Expiry is derived from each blob object's end epoch against the current epoch; periods in the tray (30 days, 6 months, 1 year, 2 years) map to epoch counts for the current network.
- Verify re-fetches slivers from storage nodes and checks them against the blob id, on demand, and records the result and time in the inspector.
- Agents: an MCP server speaks to the same client with a wallet-scoped capability the owner can revoke; the Agents view is listed in the rail but not designed in this pass.
- Confirm against the Walrus docs before copy ships: max blob size, quilt limits (blobs per quilt, per-blob size inside a quilt), encoding overhead factor (the design uses about 4.8x), fee components (storage price per unit per epoch plus write fee), epochs per period on testnet versus mainnet.
- Marked Coming and visibly disabled: desktop app download, one-signature batching, Walrus Sites deploy, the Agents screen.
- Desktop app later: Tauri wrapper of the same UI with a real filesystem drop source, resumable multi-GB uploads and background extend.
- Sample data throughout: names, ids, sizes, dates and prices are placeholders.
