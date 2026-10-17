# Morse Uploader v2: protocol facts sheet

Research date: 2026-10-17. Live chain reads between 19:37Z and 19:53Z (UTC).
Every build phase follows this sheet. Where a fact is not confirmed it says UNCONFIRMED, with what was tried.

## How this was verified

- Package sources, read from npm tarballs: `@mysten/walrus` 1.1.7 and 1.2.35, `@mysten/seal` 1.1.3, `@mysten/sui` 2.16.3, `@arcadiasystems/morse-sdk` 0.8.2. File paths below are relative to each package's `package/` folder, for example `walrus-1.1.7:dist/client.mjs:413`.
- Walrus docs from `https://docs.wal.app/docs/<page>.md`. Seal docs from `https://docs.sui.io/sui-stack/seal/<page>.md`. Morse docs from `https://docs.morsecms.xyz/llms-full.txt`.
- Walrus Move and Rust source on GitHub, `MystenLabs/walrus` at `main` (relay controller last changed in commit 607c7fb, 2026-10-13).
- Chain state via public Sui GraphQL (`https://graphql.<network>.sui.io/graphql`). Public JSON-RPC is gone: `sui_getObject` against `fullnode.testnet.sui.io` answers "Method not found. JSON-RPC on public fullnodes has been deprecated". The build must use `SuiGrpcClient` or GraphQL, never `SuiClient` JSON-RPC.
- Nothing was installed and no SDK code was executed. The rules forbid a full `npm install`, so every SDK behavior below comes from reading the source.

## Network constants (used by every section)

| | Testnet | Walrus Mainnet | Source |
|---|---|---|---|
| Walrus system object | `0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af` | `0x2134d52768ea07e8c43570ef975eb3e4c27a39fa6396bef985b5abc58d03ddd2` | walrus-1.1.7:dist/constants.mjs:2-15, docs network-reference "System and staking object IDs" |
| Walrus staking object | `0xbe46180321c30aab2f8b3501e24048377287fa708018a5b7c2792b35fe339ee3` | `0x10b9d30c28448939ce6c4d6c6e0ffce4a7f8a4ada8248bdad09ef8b70e4a3904` | same |
| Type package (original id, used in type strings) | `0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66` | `0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77` | live: type of the system object |
| Current package (Move call target) | `0x7d3b2086808a62bbc44d18c6b1d407973d77dd26946735873092c2f5650b4611` | `0x98da433aa0139512c210597b1c5e3df6cd121d8d77f8652691bb66fadfc8aa1b` | live: `System.package_id` |
| System inner version (dynamic field key, u64) | 4 | 3 | live: `System.version` |
| n_shards | 1000 | 1000 | live: `SystemStateInnerV1.committee.n_shards` |
| Committee members | 99 | 94 | live: `committee.members` length |
| Current Walrus epoch | 553 | 41 | live: `StakingInnerV1.epoch` |
| Morse package | `0x468727724e86b7d305e961aee73ef9d868b4b68478952fc23748ef4ccfcaf4b2` (original `0x191946c5dc1ea1b978e664d85455e81ef9bdd1d3dbb221fd48cf9008d46a00f0`) | `0x4fc7af5d1e19f96e5fab4e677948214eec35e238b252a106c7d5036dcebdcae2` | morse-sdk-0.8.2:dist/config.js:68-101, Morse docs "Walrus Mainnet / The deployment" |
| WAL coin type (Walrus Mainnet) | resolved at runtime by the SDK | package `0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59` | docs network-reference "Package IDs" |

Token units: 1 WAL = 1,000,000,000 FROST; 1 SUI = 1,000,000,000 MIST (docs network-reference "Token units").

Testnet note: an older testnet deployment still exists (system `0x98ebc47370603fe81d9e15491b2f1443d619d1dab720d586e429ed233e1255c1`, type package `0x795ddbc26b8cfff2551f45e198b87fc19473f2df50f995376b924ac80e56f88b`). It is the pre-redeploy network that the walrus SDK docs example still shows (walrus-1.1.7:docs/index.md:48). Do not use it. Derive the Blob type at runtime with `client.walrus.getBlobType()` (walrus-1.1.7:dist/client.mjs:108-112), never hardcode it. The docs say testnet package ids change on redeploy (network-reference "How Testnet compares with Mainnet").

---

## 1. Max blob size

**Verified value**
- Protocol maximum: **14,599,533,452 bytes = 13.597 GiB (about 13.6 GiB)**, identical on both networks because both run 1000 shards.
- Formula: `primary_source_symbols × secondary_source_symbols × max_symbol_size`, which is `334 × 667 × 65,534`.
  - `max_faulty = floor((1000 - 1) / 3) = 333`
  - `primary = 1000 - 2×333 = 334`
  - `secondary = 1000 - 333 = 667`
  - RS2 max symbol size is `u16::MAX - 1` = 65,534

**Sources**
- Rust `crates/walrus-core/src/encoding/config.rs` `max_blob_size_for_n_shards` (lines 795-799) and `source_symbols_for_n_shards` (742-750).
- `crates/walrus-core/src/encoding/common.rs:851-855` (`Self::RS2 => u16::MAX - 1`).
- TS mirror: walrus-1.1.7:dist/utils/index.mjs:11-14 and 25-33.
- Docs system-constraints "Blob size": "approximately 13.6 GiB".
- Live: n_shards 1000 on both networks.

**The limit that applies to this app is lower: 1 GiB per upload through the upload relay.**
- The public relay code wraps its router in `DefaultBodyLimit::max(1024 * 1024 * 1024)` (`crates/walrus-upload-relay/src/controller.rs:390`, main at 607c7fb).
- The SDK sends the raw blob as one POST body to `/v1/blob-upload-relay` (walrus-1.1.7:dist/upload-relay/client.mjs:33-50).
- UNCONFIRMED that the deployed public relays use the same limit. I tried a POST to the testnet relay declaring `Content-Length: 1073741825` with no body, and it timed out waiting for the body rather than returning 413.

**Direct-to-node writes in a browser (no relay)**
- These have no relay cap.
- The SDK holds the whole blob plus all encoded slivers in memory. `encodeBlob` returns `sliversByNode`; the docs say about 4.5x the blob size in RAM (large-uploads "Manage memory").
- The WASM encoder is 32-bit. The Rust doc on `max_blob_size_for_n_shards` says "on 32-bit architectures, the actual limit can be smaller".
- UNCONFIRMED: the practical browser maximum. Not measured, because no SDK code was run.

## 2. Quilt limits

**Maximum blobs per quilt: 666 (QuiltV1, 1000 shards)**
- A quilt is a matrix with `secondary` = 667 columns. Each file occupies whole columns, and the index takes at least 1 column.
- SDK check: `computeSymbolSize` throws "Too many blobs" when `blobs + 1 (index) > 667` (walrus-1.1.7:dist/utils/quilts.mjs:34-36).
- Docs quilt overview: "up to 666 for QuiltV1".

**Per-file size inside a quilt: about 4 GiB, minus header**
- Each patch has a header `{version u8, length u32, mask u8}` (walrus-1.1.7:dist/utils/bcs.mjs:121-125). `length` covers the identifier, the tags and the content, so content is at most `2^32 - 1 - (2 + identifier bytes + 2 + tag bytes)`.
- Docs quilt "Per-blob size limit": "approximately 4 GiB" ("Maximum blob size in quilt" in `walrus info`).
- Other limits that also apply:
  - The quilt as a whole must fit the blob maximum (section 1).
  - In the browser via the relay, the whole quilt must be at most 1 GiB.
  - Symbol size is at most 65,534, so one column is at most 65,534 × 334 = 21,888,356 bytes. A quilt therefore holds at most 667 × 21.9 MB (walrus-1.1.7:dist/utils/quilts.mjs:44-46; "Quilt oversize" error).
- The quilt index may use at most 10 columns, otherwise "Index too large" (quilts.mjs:13, 122). Very long paths across 666 files can hit this.

**Identifier rules**

Enforced by the protocol (Rust `validate_quilt_identifier`, `crates/walrus-core/src/encoding/quilt_encoding.rs`, about lines 131-158):
- not empty
- at most 65,535 bytes
- no trailing whitespace
- no control characters (C0, DEL, C1)
- `_test`, `-test` and `.test` are explicitly valid in its doc tests

Enforced by the TS SDK:
- unique (throws "Duplicate blob identifier", quilts.mjs:75)
- `identifier.length > 65535` throws (quilts.mjs:116). This checks UTF-16 length, not bytes.
- The SDK does not check the first character, whitespace or control characters. The app must validate before encoding.

The docs are stricter and inconsistent:
- quilt overview Warning: "must start with an alphanumeric character, contain no trailing whitespace, and not exceed 64 KiB"
- quilt-http-apis: "cannot start with `_`" (publisher multipart only; `_metadata` is reserved)

Tags: total tag size at most 64 KB (docs quilt Warning). The SDK writes them as BCS after a 2-byte length (quilts.mjs:11, 90-93).

Sorting: the SDK sorts patches by identifier before encoding (quilts.mjs:70). Patch order is not drop order.

**Recommended folder to identifier mapping (follows the strictest documented rule)**
- Identifier = the POSIX relative path inside the dropped folder, without the folder name, `./` or a leading `/`. Example: `site-export/assets/a.png` becomes `assets/a.png`.
- Keep `/` separators. NFC-normalize. Strip trailing whitespace from each segment, or reject.
- Reject or rename any path whose first character is not `[A-Za-z0-9]`, for example `_next/...` or `.well-known/...`. The Rust validator accepts them, but the docs say they must start alphanumeric, so the UI should warn.
- Reject duplicates after normalization, more than 666 files, any file of 4 GiB or more, and any quilt over 1 GiB when using the relay.
- Put the MIME type in a tag, for example `{ "content-type": "image/png" }`.
- UNCONFIRMED: whether the aggregator maps a patch tag to the `Content-Type` header. Docs quilt-http-apis say only "Additional custom headers from blob tags, if configured".
- UNCONFIRMED: whether `GET /v1/blobs/by-quilt-id/{quilt_id}/{identifier}` resolves identifiers that contain `/`. Not tested, because no quilt with nested paths was at hand. Use patch-id URLs (section 10), which do not depend on this.

## 3. Encoding overhead and encoded size

**Exact formula** (walrus-1.1.7:dist/utils/index.mjs:15-24; same as Rust `encoded_blob_length_for_n_shards`, config.rs:816-830, which says it matches `redstuff.move`):

```
n = n_shards (1000 on both networks)
primary = 334, secondary = 667            // from section 1
symbol = floor((max(size,1) - 1) / (primary*secondary)) + 1
if symbol is odd: symbol += 1             // RS2 alignment
encoded = n*(n*32*2 + 32) + (primary+secondary)*symbol*n
        = 64,032,000 + 1,001,000*symbol   // bytes, n = 1000
units   = ceil(encoded / 1,048,576)       // storage unit = 1 MiB (index.mjs:50-53)
```

- **Fixed metadata per blob: 64,032,000 bytes (61.07 MiB)**, whatever the file size.
- Asymptotic expansion: `1001×1000 / 222,778 = 4.493x`. Docs storage-costs: "about 4.5x the original blob plus a fixed 64 MB of per-blob metadata".
- The design's "about 4.8x" is wrong. Small files are dominated by the fixed 64 MB.

**Checked against chain**
- Testnet Blob `0x0000050b…00e7`: `size` 1,048,576 has `storage.storage_size` 70,038,000, exactly as the formula gives.
- Docs quilt-http-apis store example: 1,782,224 bytes gives `encodedLength` 72,040,000, also exact.

**Worked values**

| Raw size | Encoded bytes | MiB units | Ratio |
|---|---|---|---|
| 1 MiB | 70,038,000 | 67 | 66.8x |
| 1.2 MB | 70,038,000 | 67 | 58.4x |
| 4.1 MB | 84,052,000 | 81 | 20.5x |
| 96 MB | 496,464,000 | 474 | 5.17x |
| 1 GiB | 4,888,852,000 | 4,663 | 4.55x |
| max (14.6 GB) | 65,663,566,000 | 62,622 | 4.50x |

**Quilts**
- A quilt's billed size is `encoded(quilt_bytes.length)`, and `quilt_bytes.length = symbol × 334 × 667` after column padding (quilts.mjs:119-123).
- For an exact preview, run `client.walrus.encodeQuilt({ blobs })` locally (walrus-1.1.7:dist/client.mjs:1290), then apply the formula to the result length. Or replicate `computeSymbolSize`.

**Preview function**
- Use `client.walrus.storageCost(size, epochs)`, which returns `{ storageCost, writeCost, totalCost }` in FROST (client.mjs:413-427).
- It reads `committee.n_shards` and the prices from the live system state.

## 4. Fee components

**Storage and write fees, paid in WAL (FROST)**

All of these live in `SystemStateInnerV1`. That struct is the dynamic field of the System object keyed `u64 = System.version` (client.mjs:133-138; Move `system_state_inner.move:72-74`).
- `storage_price_per_unit_size`: FROST per 1 MiB of encoded size per epoch.
- `write_price_per_unit_size`: FROST per 1 MiB of encoded size, charged once at register.
- Formulas, from client.mjs:417-427 and Move `system_state_inner.move:727-730` and `process_storage_payments` 431+:
  - storage fee = `units × storage_price × epochs`
  - write fee = `units × write_price`

Live values:

| | Testnet (read 2026-10-17T19:37:12Z) | Walrus Mainnet (read 19:38:05Z) |
|---|---|---|
| `storage_price_per_unit_size` | 2,364 FROST | 51,854 FROST |
| `write_price_per_unit_size` | 4,725 FROST | 94,184 FROST |
| `total_capacity_size` / `used_capacity_size` | 318,181,818,181,818 / 4,779,913,541,344 | 4,000,000,000,000,000 / 2,317,861,636,248,816 |
| `future_accounting.length` (max epochs ahead) | 53 | 53 |

- Prices can change at any moment. Move `system_state_inner.move:145-146`: "Prices are no longer updated here; they are applied immediately when price votes are cast via set_storage_price_vote / set_write_price_vote".
- Do not use `StakingInnerV1.next_epoch_params` prices. Both networks currently show `18446744073709551615` (u64::MAX) there.
- Docs storage-costs "How pricing works": storage is "priced at a fixed rate of $0.023/GB/month", and the WAL amount follows the WAL price through node price votes.

Consequence for the cost preview:
- The SDK builds an exact-amount WAL coin (`coinWithBalance(amount)`), passes it to `reserve_space` and `register_blob`, then calls `0x2::coin::destroy_zero` (client.mjs:454-469).
- If the price changes between building and executing, the transaction aborts: insufficient coin if the price rose, `destroy_zero` failing if it fell.
- Build the register transaction right before the wallet prompt. On abort, re-read prices and rebuild.

**Gas, paid in SUI (MIST)**
- Two transactions per blob.
  - register = `reserve_space` + `register_blob`, plus the relay tip and auth payload when using the relay
  - certify = `certify_blob`
- Sources: flows/write-blob.mjs:41-67 and 121-136; docs storage-costs "Measuring costs".
- Estimating register gas: build the transaction with the sender set, then `client.core.simulateTransaction({ transaction, include: { effects: true } })` and read `effects.gasUsed.{computationCost, storageCost, storageRebate}` (sui-2.16.3:dist/client/types.d.mts:385-391, 687, 709-714). Simulation also fails when WAL is short, which is a useful pre-check.
- Estimating certify gas: certify cannot be simulated before the certificate exists. Docs storage-costs say its SUI cost "is independent of blob size or epoch lifetime", so use a constant from the observations below.
- Gas budget rule (docs.sui.io gas-in-sui "Gas budgets"): `gas_budget >= max{computation_fees, total_gas_fees}`, with net storage. The wallet's dry run sets it.

Observed net gas (computation + storage - rebate), recent transactions read 2026-10-17 about 19:52Z:

| Transaction | Testnet (RGP 1000) | Walrus Mainnet (RGP 100) |
|---|---|---|
| register (reserve_space + register_blob) | 3,975,376 MIST (0.0040 SUI), SDK-shaped with 2× `destroy_zero` | 2,134,878 MIST (0.0021 SUI), CLI-shaped |
| certify_blob | 1,030,696 MIST (0.0010 SUI) | 173,696 MIST (0.00017 SUI) |
| extend_blob | not sampled | 158,079 MIST (0.00016 SUI) |
| delete_blob | not sampled | -385,501 to -2,368,743 MIST (net rebate to the user) |

- Source: GraphQL `transactions(filter:{function:"<current package>::system::<fn>"})`. Script: `/private/tmp/claude-501/-Users-manda-morse-dcms/9350392b-a970-48ef-b222-66a09ad179f8/scratchpad/uploader-v2/scripts/gas.py`.
- The mainnet register gross storage charge is 110,754,800 MIST, almost all rebated (108,767,922), because it rewrites the shared System object.

**Upload relay tip, paid in SUI (MIST)**

Endpoints:
- testnet `https://upload-relay.testnet.walrus.space`
- Walrus Mainnet `https://upload-relay.mainnet.walrus.space`
- tip config at `/v1/tip-config` (docs network-reference "Upload relays")

Live tip config (read 2026-10-17T19:40:44Z):
- Testnet: `{"send_tip":{"address":"0x4b6a7439159cf10533147fc3d678cf10b714f2bc998f6cb1f1b0b9594cdc52b6","kind":{"const":105}}}`, so 105 MIST per blob.
- Walrus Mainnet: `{"send_tip":{"address":"0x765a6ff2c13b47e2603416d0b5a156df498a5c51bc8085be3838e43e06086256","kind":{"linear":{"base":0,"encoded_size_mul_per_kib":40}}}}`
  - formula: `0 + 40 × ceil(encoded_bytes / 1024)` MIST
  - 1.2 MB file: 2,735,880 MIST (0.0027 SUI)
  - 96 MB file: 19,393,160 MIST (0.0194 SUI)
  - 1 GiB file: 190,970,800 MIST (0.19 SUI)
- The tip is computed on encoded size. Sources: walrus-1.1.7:dist/client.mjs:574-583; Rust `crates/walrus-sdk/src/upload_relay/tip_config.rs:27-59`. The relay operator doc's "linear in the unencoded blob size" is wrong.

How `sendTip: { max }` works (types.d.mts:32-49; client.mjs:562-598):
- With `{ max }`, the SDK fetches `/v1/tip-config` once (cached) and computes the tip.
- It throws `Tip amount (N) exceeds the maximum allowed tip (M)` before anything is signed when the tip is over `max`.
- In the register transaction it adds the auth payload `sha256(blob) || sha256(nonce) || u64 size` as a pure input, plus `transferObjects([coinWithBalance({ balance: tip })], relayAddress)`.
- With `{ address, kind }`, the SDK uses a fixed tip config and does not fetch.
- With no `sendTip`, no tip is sent and a paid relay refuses the upload.
- The docs example `max: 1_000` and Morse's default `10_000_000` both fail on Walrus Mainnet: 10,000,000 MIST covers only about 250,000 KiB encoded, which is roughly a 42 MB file. Set `max` from the computed tip plus a margin, and show the tip in the cost line.

## 5. Epochs and periods

**Verified values**

| | Testnet | Walrus Mainnet |
|---|---|---|
| Epoch duration | 1 day (`epoch_duration` 86,400,000 ms) | 14 days (`epoch_duration` 1,209,600,000 ms) |
| Max epochs ahead | 53 | 53 |
| Current epoch start | 2026-10-16T22:46:52Z | 2026-10-06T15:10:31Z |

- Sources: live `StakingInnerV1.epoch_duration`; `future_accounting.length`; docs network-reference "Network parameters".
- Current epoch start comes from live `epoch_state = NextParamsSelected(ts)`. Move `staking_inner.move:87-89` documents that variant: "The contained timestamp is the start of the current epoch".
- Testnet epochs drift from the nominal schedule: `first_epoch_start + (epoch-1)×1 day` would give 2026-10-07. Treat every expiry date as an estimate, and always read the current epoch start live.

**Semantics**
- `reserve_space` sets `end_epoch = current_epoch + epochs_ahead` and requires `0 < epochs_ahead <= 53` (Move `system_state_inner.move:198-211`).
- Storage is valid while `epoch < end_epoch`. The current epoch is already partly used.
- Extend requires `end_epoch - current_epoch + extra <= 53` (`system_state_inner.move:399-404`). Nobody can hold more than 53 epochs ahead of now.

**Mapping rule (recommended)**
- `epochs = ceil((now + period - current_epoch_start) / epoch_duration)`, capped at 53.
- Show the estimated expiry date as `current_epoch_start + epochs × duration`.
- "At least the period" is better than rounding, which under-delivers.

Live mapping at 2026-10-17T19:52Z (script `/private/tmp/claude-501/-Users-manda-morse-dcms/9350392b-a970-48ef-b222-66a09ad179f8/scratchpad/uploader-v2/scripts/periods.py`):

| Period | Testnet epochs | Walrus Mainnet epochs |
|---|---|---|
| 30 days | 31 (expires about 2026-11-16) | 3 (about 2026-11-17; becomes 4 when more than 12 days into an epoch) |
| 6 months (182.5 d) | 184: **exceeds 53, not possible** | 14 (about 2027-04-20) |
| 1 year (365 d) | 366: **exceeds 53, not possible** | 27 (about 2027-10-19; 28 when more than 13 days in) |
| 2 years (730 d) | 731: **exceeds 53, not possible** | 53 (about 2028-10-17), **only when at most 12 days into the current epoch**; otherwise impossible, and the max is 53 epochs |

- Testnet maximum right now: 53 epochs, ending around 2026-12-08, about 52 days.
- Walrus Mainnet maximum right now: about 730.8 days.

## 6. Browser write flow with Wallet Standard

**APIs** (walrus-1.1.7:dist/client.mjs:1433 and 1462; flows/write-blob.mjs; flows/write-files.mjs; types.d.mts:258-303; SDK docs walrus-1.1.7:docs/index.md:188-258)

- `client.walrus.writeBlobFlow({ blob: Uint8Array, resume? })` for one file as one blob.
- `client.walrus.writeFilesFlow({ files: WalrusFile[], resume? })` for N files as one quilt. Build each file with `WalrusFile.from({ contents: Uint8Array, identifier, tags })`.

Steps (same for both flows):
- `encode()`
  - With a relay it only computes metadata (blob id, root hash, nonce) in WASM (write-blob.mjs:17-40).
  - Without a relay it computes the full sliver encoding.
  - Returns `{ step: 'encoded', blobId, rootHash, unencodedSize, nonce? }`.
- `register({ epochs, deletable, owner, attributes? })`
  - Returns a `Transaction` to sign with the wallet: relay tip (if any) + reserve_space + register_blob + transfer to owner (write-blob.mjs:41-67).
  - `writeFilesFlow` adds the attribute `_walrusBlobType: "quilt"` (write-files.mjs:26-35).
- `upload({ digest })`, where `digest` is the register transaction's digest. It POSTs to the relay or writes slivers to all nodes, then returns `{ step: 'uploaded', blobId, blobObjectId, txDigest, certificate }`, with the certificate as base64 BCS (write-blob.mjs:68-120).
- `certify()` returns a `Transaction` to sign (write-blob.mjs:121-136).
- `listFiles()` (files flow) returns `{ id: quiltPatchId, blobId, blobObject }[]`; `getBlob()` (blob flow) returns the certified Blob.
- `run({ signer, epochs, deletable, owner? })` is an async iterator yielding every step. `executeRegister` and `executeCertify` sign through a `Signer`.
- `writeBlob` and `writeFiles` take `onStep` and `resume` (types.d.mts:201-216).
- Browser note from the SDK docs: call register and certify from separate user gestures so wallet popups are not blocked (docs/index.md:188-196, 257-258).

**Signatures**

| Case | Signatures |
|---|---|
| One blob | 2 (register, certify) |
| One quilt (any file count up to 666) | 2 |
| N items through the relay, using flows as-is | 2N |
| N items through the relay, minimum | N + 1 |
| N items direct to nodes | 2 |
| Seal decrypt | 1 personal-message signature per SessionKey TTL |

- Relay minimum: one register-and-tip transaction per item, then one certify transaction carrying all N certifies.
  - Why per item: the relay reads the auth payload only from `ptb.inputs.first()` (`crates/walrus-upload-relay/src/utils.rs:81`), so one tip transaction authorizes exactly one relay upload.
  - Batched certify: call `client.walrus.certifyBlobTransaction({ transaction: tx, blobId, blobObjectId, certificate, deletable })` once per uploaded step on the same `tx` (client.mjs:713-716).
- Direct to nodes: one PTB with N `registerBlob` calls and one PTB with N certifies. The docs storage-costs "Batch blob operations" say you "can register or certify multiple blobs in a single Sui PTB". Not recommended in browsers (see below).
- Below 2 per batch is impossible in any non-custodial client: certify needs the node certificate, which only exists after register and upload.
- "Sponsored" does not help. Docs sponsored-uploads: "Walrus has no built-in gas-sponsorship primitive that lets a user sign a store while a separate sponsor pays the gas."
- Morse record: +1 per entry with `addEntry` (section 12). A raw `add_entry_to_collection` moveCall can be appended to the certify PTB (signature in section 12), but morse-sdk 0.8.2 exports no builder for it (`ptb/*` is not in `dist/index.d.ts`).
- Seal decrypt reference: Seal docs using-seal "Session keys".

**Queue step mapping (no event emitter; use returned steps or `onStep`)**
- encode: client-side, then `step: 'encoded'`. The blob id is known here and can be shown in the queue immediately.
- register: wallet signature, then `step: 'registered'` (`blobObjectId`, `txDigest`). **The design has no register step.** Add one, or make "upload" start with "Sign to register".
- upload: `step: 'uploaded'` (`certificate`).
- certify: wallet signature, then `step: 'certified'`.
- record: Morse `addEntry` result `{ digest, entryId }`.
- Progress and speed: the SDK has no progress callback in 1.1.7 or 1.2.35 (grep for "progress" finds nothing).
  - Relay mode is one POST. Pass a custom `fetch` in `uploadRelay` (UploadRelayClient takes `{ host, fetch, timeout, onError }`, walrus-1.1.7:dist/upload-relay/client.mjs:8-13) built on `XMLHttpRequest` `upload.onprogress`.
  - Direct mode: wrap `storageNodeClientOptions.fetch` and count completed sliver PUTs.
- Relay request timeout defaults to **30 s** (upload-relay/client.mjs:12). Set `uploadRelay.timeout`; the Walrus browser example uses 600,000 (docs examples/browser-and-mobile). The design's "publisher timeout" is this relay timeout; this architecture has no publisher.

**Certify fails after upload ("Finish")**
- Surface `blobObjectId` (0x… Sui object, known from the `registered` step) and `blobId`.
- Persist the whole `uploaded` step, including `certificate`, in IndexedDB.

Finish within the same Walrus epoch:
- `client.walrus.certifyBlobTransaction({ blobId, blobObjectId, certificate: savedBase64, deletable })` then a wallet signature. `certificate` accepts a base64 BCS string (types.d.mts:105-120; client.mjs:683-704).
- Do not rely on `writeFilesFlow({ resume }).run()` on 1.1.7: resuming from `uploaded` fails with "upload must be executed before calling certify" (fixed in 1.2.33, walrus-1.2.35:CHANGELOG.md).
- `run()` needs a `Signer`. morse-sdk's `WalletStandardSigner` provides one for Wallet Standard wallets (section 12), but its popups are not tied to a user gesture.

Finish after an epoch change:
- The old certificate is invalid. Move `certify_blob` asserts `certified_msg.cert_epoch() == self.epoch()` (`system_state_inner.move:352-370`).
- Re-collect signatures with `client.walrus.getStorageConfirmations({ blobId, deletable, objectId })` and pass `confirmations` to `certifyBlobTransaction` (client.mjs:992-1016). Or re-upload with `resume` (the SDK skips slivers nodes already hold, client.mjs:1205-1225).
- A relay re-upload needs a fresh tip transaction. Relays enforce a freshness window: docs say a 1 hour default, the code has no default (`tx_freshness_threshold_secs`, controller.rs:77-83). UNCONFIRMED: the value configured on the public relays.

Hard deadline:
- Certify must happen before `storage.end_epoch` (Move `blob.move:209`).
- A registered but never certified deletable blob can be deleted to get its `Storage` object back (`blob.move:236-247`; delete does not require certification).

**Direct upload vs relay**
- Docs recommend the relay for browsers:
  - examples/browser-and-mobile, compatibility table: "Store path | Upload relay (browsers cannot hold the direct-store fan-out)"
  - SDK docs: about 2,200 requests to write a blob directly (walrus-1.1.7:docs/index.md:5-8)
  - Morse docs: direct writes hit "about 95" nodes on Walrus Mainnet and often fail with `NotEnoughBlobConfirmationsError`
- CORS verified live (19:4xZ): both relays and both Mysten aggregators answer `access-control-allow-origin: *`.
- Trade-offs to disclose: the relay sees the plaintext bytes (encrypt first for privacy), charges a SUI tip, and caps uploads at 1 GiB.

## 7. Reading owned blobs

**Move type**
- Testnet: `0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66::blob::Blob`
- Walrus Mainnet: `0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob`
- At runtime: `await client.walrus.getBlobType()`.

**Fields** (walrus-1.1.7:dist/contracts/walrus/blob.mjs:10-21; storage_resource.mjs:9-15; Move `blob.move:47`)
- `id`
- `registered_epoch: u32`
- `blob_id: u256`: GraphQL returns a decimal string. Convert with `blobIdFromInt(BigInt(s))`, which is u256 little-endian to URL-safe base64 with no padding (walrus-1.1.7:dist/utils/bcs.mjs:29-31).
- `size: u64`: the unencoded byte size.
- `encoding_type: u8` (1 = RS2)
- `certified_epoch: Option<u32>`: null means registered, not certified.
- `storage: { id, start_epoch, end_epoch, storage_size }`: `storage_size` is the encoded size actually billed.
- `deletable: bool`
- Attributes: the dynamic field named `b"metadata"` (BCS of the name `vector<u8>` is base64 `CG1ldGFkYXRh`) holds `Metadata { metadata: VecMap<String,String> }` (metadata.mjs:11-13; client.mjs:832-842).
- There is no encryption marker in Walrus (section 11).

**Efficient listing via GraphQL** (tested live on testnet; one request returns 50 blobs and their attributes):

```graphql
{ address(address: "<owner>") {
    objects(filter: { type: "<BlobType>" }, first: 50, after: <cursor>) {
      pageInfo { hasNextPage endCursor }
      nodes { address
        contents { json }
        dynamicField(name: { type: "vector<u8>", bcs: "CG1ldGFkYXRh" }) {
          value { ... on MoveValue { json } } } } } } }
```

- Limits from live `serviceConfig`: max page size 50 (`first: 100` fails "Page size is too large: 100 > 50"), default 20, `maxMultiGetSize` 200, query timeout 40 s.
- gRPC alternative: `client.core.listOwnedObjects({ owner, type, limit, cursor, include: { content: true } })` (sui-2.16.3:dist/client/types.d.mts:89-95), then one attribute read per blob.
  - Avoid `client.walrus.readBlobAttributes` on 1.1.7: it throws when a blob has no metadata (fixed in 1.2.33).

**Quilt vs plain blob**
- A quilt has attribute `_walrusBlobType = "quilt"`. The TS SDK sets it (write-files.mjs:26-35), and so does the Rust client (`BLOB_TYPE_ATTRIBUTE_KEY` / `QUILT_TYPE_VALUE`, `crates/walrus-core/src/encoding/basic_encoding.rs:24-27`, written in `crates/walrus-sdk/src/node_client/quilt_client.rs:831-834`).
- So quilts made by the SDK, the CLI or a publisher are all tagged.

**Quilt patch ids and names**
- These are not on chain; they live in the quilt index inside the blob.
- Aggregator: `GET {aggregator}/v1/quilts/{quilt_id}/patches` returns `[{ "identifier", "patch_id" }]` (aggregator OpenAPI `list_patches_in_quilt`, read from `https://aggregator.walrus-testnet.walrus.space/v1/api`).
- SDK: `(await client.walrus.getBlob({ blobId })).files()`, then `getIdentifier()` and `getTags()` per file (files/blob.mjs; readers/quilt.mjs:112-140).
- **On walrus 1.1.7 the SDK quilt reader has a bug**: `#readBytesFromSlivers` reads one sliver too few when content starts partway into a column (readers/quilt.mjs:23, fixed in 1.2.35). It affects both the index and patch content. On 1.1.7, read quilt lists and patches through the aggregator.

**Expired blobs**
- They stay owned Blob objects, with `storage.end_epoch <= current epoch`. They appear in the same listing.
- They cannot be extended (`assert_certified_not_expired`, `blob.move:111-116`) or deleted (`blob.move:247`).
- `blob::burn` (public, `blob.move:261`) removes the object for a Sui storage rebate. The SDK has no wrapper; use a raw moveCall `${currentPackage}::blob::burn`.
- Nodes may drop the slivers, so the bytes can be gone.
- Never-certified blobs also appear, with `certified_epoch: null`; show them as "Finish".

## 8. Extend, delete, verify

**Extend**
- `client.walrus.extendBlobTransaction({ blobObjectId, epochs })` or `{ endEpoch }` (client.mjs:788-830; types.d.mts ExtendBlobOptions).
- Cost: `ceil(storage_size / 1 MiB) × storage_price × epochs` WAL, with no write fee (client.mjs:793). Gas about 0.00016 SUI on Walrus Mainnet (section 4).
- Rules (Move `system_state_inner.move:390-427`): the blob must be certified and not expired, and the new end must stay within 53 epochs of now.
- Batching: "Extend all" can be one PTB with N `extendBlob(...)` thunks (each adds its own WAL coin), so one signature.

**Delete**
- `client.walrus.deleteBlobTransaction({ blobObjectId, owner })` (client.mjs:739-779). Move `delete_blob` returns the `Storage` object to the owner (`system_state_inner.move:373-375`).
- Conditions: the blob must be deletable and unexpired.
- No WAL is refunded. The user keeps a `Storage` resource that a future register of equal or smaller size and the same period could reuse. The SDK does not reuse it automatically; the CLI does (docs managing-blobs "Delete blobs").
- Gas is net negative (a SUI rebate).
- Privacy caveat, from the same docs section: delete does not remove other users' copies, caches or past nodes' slivers.

**Verify against storage nodes**
- `await client.walrus.readBlob({ blobId })` (client.mjs:146-161) fetches primary slivers from the committee until it has 334 (one per primary source symbol), decodes, and recomputes metadata in WASM.
  - It throws `InconsistentBlobError` if the recomputed blob id differs.
  - It retries once on epoch-change errors (client.mjs:65).
- Pair it with `client.walrus.getVerifiedBlobStatus({ blobId })` (client.mjs:320-372), which asks all committee nodes for a quorum status: `permanent` or `deletable`, end epoch, initial certified epoch.
- Live example: one testnet node returned `{"permanent":{"endEpoch":606,"isCertified":true,"initialCertifiedEpoch":553,...}}`.
- Docs walrus-client/verifying-availability "Verify integrity" describes the same re-derive-and-compare check.
- Show: "Bytes match the blob id", the time, and the end epoch from the status. The SDK does not report how many nodes answered; count them by wrapping `storageNodeClientOptions.fetch` if the UI needs a number. The design's "3 storage nodes" is not what happens.
- Cost: about 335 requests per read (docs/index.md:7), no gas.

**Risk: the Morse docs report this path failing**
- "`morse entry read` ... fail on the default storage-node read path with `No valid blob metadata could be retrieved from any storage node`", reproduced on testnet 2026-10-17 (Morse docs "Walrus Mainnet / Known issue in morse-cli 0.10.1").
- The node API itself works: at 19:51Z a GET of `/v1/blobs/<id>/metadata` on testnet node `walrus-01.tududes.com:9185` returned 200 with 66,044 bytes, the correct V1 size. `getBlobMetadata` is unchanged between 1.1.7 and 1.2.35.
- RESOLVED 2026-10-17 (orchestrator). The cause was in morse-sdk, not Walrus. `DefaultWalrusReadAdapter.readBlobByObjectId` passed the on-chain `blob_id` u256 decimal string straight to `readBlob`, without `blobIdFromInt`. It is fixed in arcadiasystems/morse-dcms PR #11 (morse-sdk 0.8.3). A live testnet read failed before the fix and returned the exact bytes after it. This app calls `@mysten/walrus` directly, so Verify must convert `blob_id` with `blobIdFromInt` before `readBlob`. Phase 1 still confirms `readBlob` from a real browser once.

## 9. Auto-extend with a WAL cap

**There is no on-chain scheduler.** Every extend is a transaction someone signs and pays gas for. A static app with no backend has three real options:

1. **Client-side, while the app is open.** On load and on a timer, find blobs below a threshold and propose one batched extend PTB, which the user signs.
   - The WAL cap is enforced by the app: it is a setting stored locally, and the app refuses to build an extend above it.
   - Nothing happens while the app is closed. Missing the end epoch makes a blob unextendable.
2. **SharedBlob "tip jar".** `shared_blob::new_funded(blob, wal)` or `new(blob)`, then `fund(...)`. Anyone can call `extend(shared, system, epochs)`, paid from the pooled WAL (Move `contracts/walrus/sources/system/shared_blob.move:12-52`; deployed on both networks, checked via GraphQL).
   - The deposited WAL is a real on-chain cap.
   - **It is irreversible:**
     - there is no unwrap or withdraw function
     - the blob becomes a shared object with no owner, so it leaves the owned-blob list
     - it can never be deleted (docs managing-blobs "Shared blobs": "can only contain permanent blobs and cannot be deleted before their expiry")
     - leftover WAL stays locked
     - someone still has to send each `extend` transaction
   - No public keeper service was found (UNCONFIRMED that one exists).
   - The Morse attach (`&Blob` input) cannot take a SharedBlob's inner blob.
3. **Prepay.** Buy the maximum period up front (53 epochs), within the 53-epoch cap.

What Console does instead: a backend task with a custodial Pearl wallet (docs console/storage-epochs "Automatic extension"). That model is unavailable here by design.

Suggested UI copy, honest version: "Auto-extend runs while Morse Uploader is open. It asks your wallet to sign one transaction for all blobs that are close to expiry and never spends more than your WAL cap."

## 10. Aggregator and Walrus Site links

**Mysten aggregators** (docs network-reference "Aggregators and publishers"; both answer 200 and CORS `*` live)
- Testnet: `https://aggregator.walrus-testnet.walrus.space`
- Walrus Mainnet: `https://aggregator.walrus-mainnet.walrus.space`
- Docs: "Do not hardcode a single community endpoint"; the operator list is at `https://docs.wal.app/operators.json`.

**URL formats** (docs http-api/reading-blobs, quilt-http-apis, aggregator OpenAPI)
- Blob: `{agg}/v1/blobs/{blobId}`, with the blob id in URL-safe base64.
- By object id: `{agg}/v1/blobs/by-object-id/{0xObjectId}`, which serves blob attributes such as `content-type` and `content-disposition` as headers.
- Quilt patch: `{agg}/v1/blobs/by-quilt-patch-id/{patchId}`. The patch id is URL-safe base64 of 37 bytes: quilt blob id plus `{version u8, start u16, end u16}` (bcs.mjs:113-120).
- Quilt by identifier: `{agg}/v1/blobs/by-quilt-id/{quiltId}/{identifier}`.
- Patch list: `{agg}/v1/quilts/{quiltId}/patches`.
- Range reads are supported and verified: `-r 0-99` returned 206.
- Consistency flags: `?strict_consistency_check=true`; `?skip_consistency_check=true` only for trusted writers.
- Right after certify, a CDN may serve a cached 404; retry with backoff (docs troubleshooting/reading-blobs-after-upload).

**Walrus Sites** (docs sites/linking/linking-to-walrus-sites; sites/portals/mainnet-testnet)
- Format: `https://{suins-name}.wal.app[/path]`, or a base36 object id subdomain on a portal that enables it.
- **`wal.app` serves only Walrus Mainnet sites that have a SuiNS name. No public testnet portal exists, and `wal.app` does not serve base36 object ids.**
- A plain blob or quilt is not a site. A site is a separate Sui object (Walrus Sites package: testnet `0x22b8c1496650eb45fbcca0f8f37fae77ed33b7d4eaab4da5f0bb9b62a8708dcb`, Walrus Mainnet `0x5a0c509a659ba982f91ff1189872b8d528f8c02b5f6285a3931fc4c2869ccc9c`, docs network-reference). A "Walrus Site link" only exists for site objects.

## 11. Seal from the browser

**API** (seal-1.1.3:dist/types.d.mts:9-55, client.d.mts, session-key.d.mts; Seal docs using-seal)

Setup:
- Extension: `new SuiGrpcClient(...).$extend(seal({ serverConfigs, verifyKeyServers?, timeout? }))`.
- Or: `new SealClient({ suiClient, serverConfigs, verifyKeyServers, timeout })`.
- `KeyServerConfig = { objectId, weight, apiKeyName?, apiKey?, aggregatorUrl? }`. `aggregatorUrl` is required for committee servers.

Encrypt before upload:
- `const { encryptedObject } = await client.seal.encrypt({ threshold, packageId, id, data })`.
- This only needs on-chain key server public keys, plus `/v1/service` verification when `verifyKeyServers` is true (key-server.mjs:102-116).

Decrypt for allowed wallets:
- Create the session key: `SessionKey.create({ address, packageId, ttlMin, suiClient })`.
- Sign it: `getPersonalMessage()`, then the wallet's `signPersonalMessage`, then `setPersonalMessageSignature(signature)`.
- Build the approval transaction: a `Transaction` that only calls `${packageId}::<module>::seal_approve*`, built with `tx.build({ client, onlyTransactionKind: true })` (using-seal "Decryption").
- Decrypt: `client.seal.decrypt({ data, sessionKey, txBytes })`. This calls `/v1/fetch_key` with the API key header when configured (key-server.mjs:161-186).
- Sessions can be persisted with `export()` and `import()`.

**An access policy package is required.** "Only wallets you allow" needs a Move `seal_approve*` policy. Morse already has one on both networks:
- `recipient_file::RecipientFile { owner, blob_id, blob_object_id: Option<ID>, name, content_type, size, members: VecSet<address>, created_at_ms }`
- `seal_approve` and `seal_approve_with_prefix` (private entry), `add_recipient`, `remove_recipient`, `share_recipient_file`
- Read live from the Walrus Mainnet Morse package via GraphQL.
- morse-sdk wraps it: `uploadEncryptedRecipientFileFromBytes`, `createEncryptedRecipientFile`, `addRecipient`, `removeRecipient`, `DefaultSealAdapter.fromMorseConfig` (morse-sdk-0.8.2:dist/index.d.ts:10-12).
- The Blob is referenced by id, not wrapped, so it stays in the wallet.
- UNCONFIRMED: Seal per folder (quilt). RecipientFile maps one identity to one `blob_id`, and morse-sdk has no quilt-patch field (ops/recipient-file.d.ts). Whether several RecipientFiles may point at one quilt blob was not tested. Per-file blobs work.

**Testnet key servers** (Seal docs pricing "Verified key servers / Testnet")
- Open mode, no credential:
  - mysten-testnet-1 `0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75`
  - mysten-testnet-2 `0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8`
  - These two are what morse-sdk pins for testnet (config.js:104-115).
  - Others: Ruby Nodes `0x6068…1da2`, NodeInfra `0x5466…1007`, Studio Mirai `0x164a…f0f2`, Overclock `0x9c94…4105`, H2O `0x39ce…25a2`, Triton `0x4cde…4c46`, Natsai `0x3c93…3dad`, Mhax `0x6a07…ba06`.
- Testnet committee: `0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98` via `https://seal-aggregator-testnet.mystenlabs.com`, 3 of 5, no credential.
- Docs warn that testnet keys have no persistence guarantee.

**Walrus Mainnet**
- Every verified operator is commercial: Ruby Nodes, NodeInfra, Overclock, Studio Mirai, H2O, Triton, Natsai, and Enoki (Mysten).
- Committee: `0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595` via `https://seal-aggregator-mainnet.mystenlabs.com`, 5 of 8, "Mainnet usage requires API credentials", header `X-API-Key` (Seal docs pricing).
- morse-sdk pins none on mainnet and exports `MAINNET_SEAL_COMMITTEE` (config.d.ts:66-68, 104-121). Morse docs: the aggregator "answers 401 to unauthenticated requests".

**What a static client can do on Walrus Mainnet without exposing a credential**
- Encryption works without a credential if `verifyKeyServers: false`, because it only uses on-chain public keys. UNCONFIRMED whether `/v1/service` verification needs the key.
- Decryption needs the credential on every `fetch_key`.
- Options:
  - (a) Bring your own credential: the user pastes their own operator key, stored only in their browser. Morse docs do the same with `MORSE_SEAL_API_KEY` for the CLI.
  - (b) Hide Seal on Walrus Mainnet.
  - (c) Ship an app key in the bundle. Rejected: Morse docs "Keep the Seal credential out of the browser bundle".
- UNCONFIRMED whether any operator issues origin-restricted browser keys.
- Also gate encryption: check the credential first (Morse CLI refuses on 401 or 403), or users pay to store content nobody can decrypt.

**How encrypted blobs are marked (there is no Walrus-native marker)**
1. Morse RecipientFile: `blob_object_id` points at the Blob. List by owner via `reconcileRecipientFilesOwnedBy` or `RpcRecipientFilesReader` (morse-sdk read/*). This is authoritative, and the recipient list comes with it.
2. App convention: write a Blob attribute at register, for example `attributes: { "seal": "<policy package id>" }` in `flow.register(...)` (types.d.mts WriteBlobBaseOptions). It is cheap to list with the GraphQL query in section 7. It is public metadata, so do not put secrets in it.
3. Fallback heuristic: a range read of the first bytes and `EncryptedObject.parse` from `@mysten/seal`. Not for lists.

Privacy copy: the blob id, size, Sui record, and in quilts every file name and tag stay public. The Seal identity material (`sealIdPrefix`, `sealNonce`) is not on chain in Morse's design; the share link carries it (Morse docs "React Uploader / Share links").

## 12. Publish to Morse

**Attach an existing blob as an entry: one transaction** (morse-sdk-0.8.2:dist/ops/entry.d.ts:24-60)

```ts
addEntry(adapter: WalletAdapter, config: MorsePackageConfig, {
  publicationId, publisherCapId, collectionName, name,
  blobObjectId, quiltPatchId?, contentType, signal?
}): Promise<{ digest, gasUsedMist, entryId, revisionId }>
```

- It simulates first to read the returned `entryId`, then signs once. That is two RPC calls but one signature (entry.d.ts:6-20).
- `config` comes from `morseConfig({ network })` (config.d.ts; addresses built in).
- `quiltPatchId` for a file inside a quilt: `quiltPatchIdFromString(walrusPatchIdString)` (walrus/quilt-patch-id.d.ts:31). It is 37 bytes (`QUILT_PATCH_ID_LENGTH`, types.d.ts:94).
- On-chain signature, read live on both networks: `publication::add_entry_to_collection(&mut Publication, &PublisherCap, String collection, String name, &Blob, Option<vector<u8>> patch_id, String content_type, bool encrypted, u8 access_policy, Option<vector<u8>> seal_id, &mut TxContext): u64`.
  - The Blob is a `&Blob` (immutable reference), so it stays owned by the wallet.
  - The signer must own both the Blob and the PublisherCap.
  - The `&Blob` type is pinned to the current Walrus package (testnet `0xd847…`, Walrus Mainnet `0xfdc8…`). Blobs from the old testnet deployment cannot be attached.
- PTB builder used internally: `buildAddEntry` (ptb/entry.js:29-45). Not exported from the package root.

**Wallet adapter for the browser**
- `WalletStandardSigner.fromAccount(account, { signTransaction, signPersonalMessage })` or `fromAccountAsync(...)` for Phantom-class wallets (wallets/wallet-standard-signer.d.ts; README "WalletStandardSigner"). It wraps dapp-kit's `useSignTransaction` and `useSignPersonalMessage` as a Sui `Signer`. Multisig is refused.
- `new KeypairAdapter(signer, suiGrpcClient)` accepts any `Signer` and calls `client.signAndExecuteTransaction({ signer })`, which `WalletStandardSigner` overrides (keypair-adapter.js:20-61; wallet-standard-signer.js:160).
- UNCONFIRMED end to end: the README calls `KeypairAdapter` "Server / CLI" and says browser apps implement a `WalletAdapter`. Morse's own `@arcadiasystems/morse-uploader` `useMorseFiles` builds a wallet adapter from dapp-kit callbacks (Morse docs "React Uploader / Provider and setup").

**Listing the connected wallet's targets** (read/reader.d.ts:58-144)
- Reader: `const reader = RpcPublicationReader.fromMorseConfig(config, suiGrpcClient)`. Always use `fromMorseConfig`; README line 363 warns that the raw constructor with the wrong id "silently empties type-filtered list results".
- Writable targets: `reader.listPublisherCapsOwnedBy(address, { limit, cursor })` returns `{ results: PublisherCap[] { id, publicationId, holder }, nextCursor }`.
- Owned publications: `reader.listPublicationsOwnedBy(address)` returns `{ ownerCapId, publicationId }[]`. Owning a publication is not enough to write; `addEntry` needs a PublisherCap.
- Collections: `reader.getPublication(publicationId)` returns `{ name, slug, collections: { name, storageMode, nextEntryId, entriesTableId }[] }` (types.d.ts:119-134).

## 13. Design copy: wrong or unconfirmable claims

Copy rules applied: no em dashes; the production network is "Walrus Mainnet". Placeholders such as balances and names are left alone, except where the logic itself is wrong.

| # | Where | Claim | Correct value | Replacement wording |
|---|---|---|---|---|
| 1 | index hero chip, index table "Limits", app drop zone | "13 GiB per blob" | Protocol max is 14,599,533,452 B (13.6 GiB). Through the browser relay the cap is 1 GiB per upload (section 1). | Chip: "Up to 1 GiB per file in the browser". Table: "Walrus limits only: 13.6 GiB per blob on Walrus, 1 GiB per upload from the browser, as many as you pay for". Drop zone: "Folders keep their structure and upload as one quilt of up to 666 files. Up to 1 GiB per upload." |
| 2 | app-upload "Encoded size 97.3 MB → 471 MB" | about 4.8x | about 4.49x plus 64,032,000 B per blob. For 1 quilt (4.1 MB) + 1.2 MB + 96 MB that is about 650.6 MB before quilt padding (section 3). | "Encoded size 97.3 MB → {computed} MB. Each blob carries 64 MB of fixed metadata." |
| 3 | app-blob "Encoding RS2 · 1.2 MB → 5.8 MB stored" | 5.8 MB | 70,038,000 B (66.8 MiB). Read `storage.storage_size` from chain. | "Encoding RS2 · 1.2 MB → 66.8 MiB encoded" |
| 4 | app-upload periods "30 days 6 months 1 year 2 years" | all four on any network | Testnet max is 53 one-day epochs (about 52 days). Walrus Mainnet: 3, 14, 27 or 53 epochs; 2 years only when at most 12 days into the current epoch (section 5). | Testnet options: "7 days", "30 days", "Max (about 52 days)". Walrus Mainnet: keep the four, and disable "2 years" with the note "Available again on {next epoch date}" when it exceeds 53 epochs. |
| 5 | app-blob "Paid through epoch 798 · 306 days left" | epoch 798 | Unreachable: max end epoch now is testnet 606, Walrus Mainnet 94. | "Paid through epoch {end} · about {n} days left" |
| 6 | app-blob "0.011 WAL per year", "Extend 1 year · 0.011 WAL"; app shell "Extend everything by 1 year · 0.41 WAL" | figures and "1 year" | 1 year is impossible on testnet. On Walrus Mainnet, 1 year for a 1.2 MB blob is 67 units × 51,854 × 27 = 0.0938 WAL at the 2026-10-17 price. Extends must stay within 53 epochs of now. | "Extend {period} · {computed} WAL", with the period limited to what fits in 53 epochs. Testnet: "Extend to max (about 52 days)". |
| 7 | app-upload "Storage, 1 year 0.418 WAL / Write fee 0.012 WAL / Gas, 2 transactions each ≈ 0.03 SUI / Total" | figures, no tip | On Walrus Mainnet the example batch is 0.8708 WAL storage (27 epochs) + 0.0586 WAL write fee. Gas is about 0.0021 SUI per register and 0.00017 per certify. The relay tip is about 0.0254 SUI and is missing from the sheet (section 4). | Lines: "Storage, {period}", "Write fee", "Relay tip (SUI)", "Network fees (SUI), {n} transactions". |
| 8 | app-upload "Upload · sign 6 tx … Your wallet will ask once per blob to register, once to certify. Batching with one signature comes with the desktop app." | one-signature batching | Never below 2 signatures per batch. With the relay the minimum is N+1 for N items; +1 per Morse entry unless merged. Walrus has no sponsorship primitive (section 6). | "Upload · sign {n} times. Your wallet asks once per item to register and once to certify the batch." Drop the desktop promise, or say "The desktop app can register a whole batch in one signature." |
| 9 | app shell queue | steps "encode upload certify record" | A register signature sits between encode and upload. | Steps "encode · register · upload · certify · record", or label the second step "sign and upload". |
| 10 | app shell queue "publisher timeout" | publisher | No publisher in this architecture; it is the upload relay (default timeout 30 s). | "relay timeout" |
| 11 | app-blob "Bytes match the blob id. Checked against 3 storage nodes 2 minutes ago." | 3 nodes | `readBlob` gathers 334 slivers across many nodes; the SDK does not report a node count. | "Bytes match the blob id. Rebuilt from storage nodes 2 minutes ago." |
| 12 | app-blob Share "Walrus Site link"; index table "deploy Walrus Sites" | site link for a blob | Only site objects have Walrus Site links. `wal.app` serves only Walrus Mainnet sites with a SuiNS name; there is no testnet portal. Deploy from a quilt is not built. | Share: "Aggregator link · Embed" (show "Walrus Site link" only for site objects on Walrus Mainnet). Table: "Attach blobs to Morse publications. Walrus Sites deploy is coming." |
| 13 | index table "Epochs and expiry", app-blob "Auto-extend" | "auto-extend from your wallet with a WAL cap" | No background extend without a backend; it runs only while the app is open, with a signature (section 9). | "Visible per blob. Extend by hand, or turn on auto-extend: while the app is open it asks you to sign one renewal for blobs near expiry, up to your WAL cap." |
| 14 | app-upload Seal toggle "Only wallets you allow can decrypt; the blob id still shows publicly." | incomplete | File names, sizes and tags also stay public. Walrus Mainnet needs the user's own Seal credential. Per-folder (quilt) encryption has no supported RecipientFile mapping (section 11). | "Client-side. Only wallets you allow can decrypt. The blob id, file name and size stay public. On Walrus Mainnet this needs your own Seal key server credential." |
| 15 | index table "Folders" "Quilts with paths, public or Seal-encrypted, your choice per folder" | Seal per folder | Encryption is per file; paths in a quilt stay public. | "Quilts with paths for public folders. Seal encryption per file." |
| 16 | app-blob "Delete blob · frees storage" | frees storage | Returns a reusable Storage object to the wallet. No WAL refund. Only for deletable, unexpired blobs. Other copies and caches remain. | "Delete blob · returns its storage to your wallet" |
| 17 | app shell "Expired on 3 Oct · record on Sui" | ok | Correct: expired Blob objects stay owned and listed. Dates are estimates from epoch timing. | Keep. Add a "Burn record" action for expired blobs (Sui storage rebate). |
| 18 | index "Free on testnet" | ok with caveat | Testnet tokens cost nothing, but testnet data is wiped periodically without warning (network-reference). | "Free on testnet (data is wiped periodically)" |
| 19 | index table "Agents" "MCP server with a wallet-scoped capability you can revoke" | capability | UNCONFIRMED. No Walrus or Sui primitive for a revocable, wallet-scoped capability over storage writes was found. Morse PublisherCap is scoped to one publication only. | Hold this line until the agent design exists, or use "MCP server that signs with a separate agent wallet you fund and can empty". |
| 20 | index table Walrus Console column | Google or Apple, 5 GB per space, 5 folders, 100 MiB per upload, Console manages WAL, encrypted private folders, auto-extended, upload status polling, MCP with API keys | Confirmed (docs console/overview, console/faq, console/storage-epochs). "Publishing: Not in scope" is UNCONFIRMED; the docs are silent. | Keep. For publishing: "No publishing tools". |
| 21 | app shell status "Testnet" vs copy | network name | Rule: call the production network "Walrus Mainnet", never "Sui mainnet". | Network switch labels: "Testnet" and "Walrus Mainnet". |

## UNCONFIRMED items (all in one place)

1. Deployed public relays' request body limit. Source says 1 GiB; the live probe was inconclusive.
2. Public relays' tip freshness window. Docs say 1 hour; the code has no default.
3. Practical maximum for direct-to-node encoding in a browser (WASM memory). Not measured.
4. RESOLVED: the "No valid blob metadata" failure was morse-sdk passing the u256 `blob_id` without `blobIdFromInt` (morse-dcms PR #11). The browser `readBlob` check stays as a phase 1 confirmation.
5. Seal per folder: whether several RecipientFiles may reference one quilt blob.
6. Seal on Walrus Mainnet: whether `/v1/service` verification needs the API key, and whether any operator issues browser-safe keys.
7. Aggregator behavior for quilt identifiers containing `/` at `by-quilt-id`, and whether patch tags map to `Content-Type`.
8. `KeypairAdapter(WalletStandardSigner)` as a browser `WalletAdapter`: structurally valid, not executed.
9. Whether a public keeper exists that calls `shared_blob::extend`.
10. Console "Publishing: Not in scope" (an absence claim) and the design's "wallet-scoped capability" for MCP.
11. Gas figures are observed from recent third-party transactions, not from this app's exact PTBs (relay tip, attributes). Simulate at runtime.

## Recommended package versions

morse-sdk 0.8.2, and Morse's own `@arcadiasystems/morse-uploader` 0.2.0, pin `@mysten/sui >=2.16.2 <2.17.0`, `@mysten/walrus >=1.1.6 <1.2.0` and `@mysten/seal >=1.1.3 <1.2.0` (npm view peerDependencies). Newer lines exist but are outside those ranges: `@mysten/sui` 2.36.0, `@mysten/walrus` 1.2.35 and `@mysten/seal` 1.5.0, all released 2026-10-13 and all peering on `@mysten/sui ^2.36.0`.

**Recommended: ship a morse-sdk release that widens its peers first, then build on the current line.** walrus 1.2.33 and 1.2.35 fix three bugs this app would hit on 1.1.7:
- the quilt patch and index read bug
- `readBlobAttributes` throwing on blobs without metadata
- `writeFiles` resume from `uploaded`

```
@mysten/sui            2.36.0
@mysten/walrus         1.2.35   (pulls @mysten/walrus-wasm ^0.3.1)
@mysten/seal           1.5.0
@mysten/dapp-kit-react 2.1.40 + @mysten/dapp-kit-core 1.6.38   (or @mysten/dapp-kit 1.1.17, peer sui ^2.26.1)
@arcadiasystems/morse-sdk  next release with peers sui ~2.36, walrus ~1.2.35, seal ~1.5 (does not exist yet)
```

**Fallback that installs today:** pin exact versions, with workarounds.

```
@mysten/sui            2.16.3
@mysten/walrus         1.1.7    (pulls @mysten/walrus-wasm ^0.2.2)
@mysten/seal           1.1.3
@arcadiasystems/morse-sdk  0.8.2
@mysten/dapp-kit       1.0.6    + override @mysten/slush-wallet 1.0.5
  or @mysten/dapp-kit-react 2.0.3 + override @mysten/dapp-kit-core 1.3.2
```

Why the overrides are needed: without them, `^` ranges resolve to `slush-wallet` 1.3.4 and `dapp-kit-core` 1.6.38, which both peer on `sui ^2.36.0`. That gives an install conflict or two copies of `@mysten/sui`.

Workarounds on 1.1.7:
- Read quilt indexes and patches through the aggregator.
- List attributes via GraphQL, not `readBlobAttributes`.
- Finish uploads with `certifyBlobTransaction(saved certificate)`.
