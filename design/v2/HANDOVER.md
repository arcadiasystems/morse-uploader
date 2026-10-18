# Morse Uploader v2, concept A "dark room", handover

Replaces the v1 two-pane design. Same product promise (non-custodial transfer client for Walrus, see the v1 HANDOVER for the Console comparison and the numbers to verify), new visual language and a rethought interface.

## Visual language

Walrus-world: near-black field (#07080B), glass panels (white at 4 to 8 percent with blur), hairline borders, mono uppercase labels with the `//` prefix, thin display type on the landing, violet-to-cyan gradient reserved for the primary action and for progress. The Trace stays as the mark; glass tiles carrying the Trace appear only on the landing. Status colours: cyan certified, violet encrypted or in progress, amber expiring, red failed or expired, green verified.

## The interface rethink

v1 copied FileZilla: two panes and a permanent queue. In a browser the local pane is weak (it only knows what you dropped) and the queue steals a quarter of the screen whether or not anything is moving. v2 is organised around what the user actually does: look at what they own, drop things, sign once, keep storage alive.

1. **One workspace, not two panes.** The main view is the wallet's Walrus objects. Local files never need a pane: drop anywhere on the window and they land in the staging tray.
2. **Stage, then sign.** Drops accumulate in a tray (bottom right) with the live price, the four settings (keep for, encryption, folder handling, also publish) and one button, Sign and send with the signature count. Nothing uploads by surprise, and the tray survives a reload.
3. **Transfers as a slide-over, not a dock.** A pill in the top bar shows active transfers and remaining time; it opens a panel with a summary strip (remaining, throughput, cost, signatures) and per-item four-segment progress for encode, upload, certify, record. Failures show the step, the retry countdown and Retry now.
4. **Storage clock everywhere.** Every row carries a storage-left bar; the overview has a 12-month expiry timeline; Expiring is a filter; the command palette and bulk bar both offer Extend everything expiring. This is the failure mode Console hides and the one that costs users their data.
5. **Quilts open in place.** A quilt row expands to its files; the inspector lists files by path and offers Deploy as site and Add as entries to a Morse publication.
6. **Inspector instead of a drawer.** A persistent right column for the selection: actions, verification, storage with extend and auto-extend, record, files, publish, delete.
7. **Bulk bar.** Selecting rows raises a floating bar: Extend all with the cost, Share, Verify, Publish, Delete.
8. **Command palette (⌘K).** Search and actions in one field: extend, auto-extend, go to views, jump to a blob.
9. **Overview is the home.** Stored, paid-through, price now, the expiry timeline, a drop zone, recent activity (including agent uploads), and what is published through Morse.

## Screens

| File | Screen |
|---|---|
| `index.html` | Landing in concept A with the app shot, four feature cards, Console comparison |
| `app-overview.html` | Overview home |
| `app.html` | Files with a quilt expanded and the inspector open on it |
| `app-drop.html` | Drop-anywhere state |
| `app-staging.html` | Staging tray with three items, settings and cost |
| `app-transfers.html` | Transfers slide-over with five states |
| `app-bulk.html` | Expiring filter with seven selected and the bulk bar |
| `app-palette.html` | Command palette on "extend" |

All render at 1440 and 390 with no horizontal overflow. On mobile the rail becomes a bottom tab bar, the inspector becomes a full sheet, the tray and transfers panel go full width, and the row keeps name, size and the overflow menu.

## Build notes

Same stack and protocol notes as v1 (static Next.js, @mysten/walrus with Wallet Standard, @mysten/seal, @arcadiasystems/morse-sdk). Staging tray state persists in IndexedDB keyed by wallet. Expiry derived from each blob object's end epoch and the current epoch. Transfers map encode, upload, certify, record to SDK events; a certify failure after upload keeps blobObjectId and offers Finish. Price read from the Walrus system object when the tray opens and again before signing. Sample data throughout.
