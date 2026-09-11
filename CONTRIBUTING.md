# Contributing to morse-uploader

`@arcadiasystems/morse-uploader` is a generic, headless-first React file uploader for Morse on Sui and Walrus, built on top of [`@arcadiasystems/morse-sdk`](https://github.com/arcadiasystems/morse-dcms/tree/main/morse-sdk). Issues, pull requests, and questions are welcome.

## Reporting issues

Open an issue on GitHub. Useful information: a minimal reproduction, the package version, the resolved `react` / `@arcadiasystems/morse-sdk` / `@mysten/*` versions, the Sui network, and expected vs actual behavior with full error `cause` chains.

For security-related reports, see [SECURITY.md](./SECURITY.md). Do not open public issues for vulnerabilities.

## Development setup

```sh
bun install
bun run typecheck      # tsc --noEmit
bun run lint           # biome check .
bun run test           # vitest run
bun run test:coverage  # vitest run --coverage (enforces the coverage gate)
bun run build          # tsup (emits dist/)
bun run check:exports  # publint + are-the-types-wrong
```

All gates must pass on every PR. `bun run lint:fix` applies the safe Biome autofixes.

## House style (enforced in review)

These conventions are strict. Reviewers will ask for changes that violate them.

- **No em dashes** anywhere: code, comments, strings, docs, UI copy, commit messages. Use periods, colons, commas, or parentheses.
- **One function or one React component per source file.** Never define two functions in a single file.
- **Every util gets its own file** under `src/utils/`. No grab-bag `utils.ts`. A private helper that grows beyond a one-liner moves to its own utils file rather than living inside a feature file.
- **No inline styles.** The default skin uses an external stylesheet and CSS variables / `className` / `data-*` hooks. No `style={{ ... }}`.
- **Comments explain why**, not what. Keep JSDoc terse: a one-line summary plus non-obvious constraints and `@throws` callouts on public exports.
- No nested ternaries. No decorated section comments (`// === Foo ===`). No skipped test scaffolding (`describe.skip` / `it.skip`).
- **Dependency injection over hard-coding.** Never hard-code the network, wallet, or adapter; accept them as props or arguments. Signing is always via the injected wallet; never accept a private key in the browser.
- Route user-facing error copy through the SDK's `formatUserMessage`. Validate IDs with the SDK's branded codecs, not hand-rolled regexes.
- Guard `window` / `document` access so the package stays SSR-safe and tree-shakeable (`sideEffects` is limited to CSS).

## Architecture and layering

```
src/
  files/           the RecipientFile flow: setup hook, provider/context,
                   upload, download, decrypt, recipient-file read hook, helpers
  ui/              optional styled components (separate entry, ships CSS)
  primitives/      headless prop-getter hooks (e.g. useDropzone)
  wallet-standard/ the WalletStandardAdapter and tx-receipt parsing (separate entry)
  utils/           one util per file
  constants/       one constant per file
```

`useMorseFiles` is the single place that constructs SDK clients/adapters from a
wallet; every other hook reads them from `MorseFilesProvider`. Components stay
presentational: all logic lives in hooks. No inline styles.

## Tests

- Unit tests live alongside the source as `*.test.ts(x)`. Mock the SDK boundary via injected fake adapters/reader/seal; keep fixtures deterministic (no `Math.random()`, no real network).
- Component tests use `@testing-library/react` with jsdom and `@testing-library/user-event`; assert ARIA roles and keyboard behavior, and add accessibility assertions on interactive components.
- Live testnet end-to-end tests are opt-in (gated behind an env flag) and are not part of the default CI run. They cost real SUI and WAL.
- New behavior requires test coverage. The coverage gate runs in CI.

## Pull request expectations

- One concern per PR. Feature work, dependency bumps, and refactors are separate PRs.
- All gates green on every commit, not just the final one.
- New public exports require terse JSDoc with `@throws` where applicable, and a CHANGELOG entry under `Unreleased`.
- [Conventional Commits](https://www.conventionalcommits.org/) subject line (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). The body explains the why, not the what. No em dashes.

By contributing you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
