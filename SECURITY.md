# Security policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in `@arcadiasystems/morse-uploader`, please report it privately rather than opening a public GitHub issue. Email **andreja@hypersignals.ai** with:

- A description of the issue and its potential impact.
- Steps to reproduce, ideally with a minimal code snippet.
- The package version, the resolved versions of `react` / `@arcadiasystems/morse-sdk` / `@mysten/sui` / `@mysten/walrus` / `@mysten/seal`, and the Sui network you observed it on.

We aim to acknowledge reports within 72 hours and to provide an initial assessment within one week.

## Security model

This package is a browser-side React component. Its security model follows the SDK's: the user's wallet is the only place that holds private signing material.

- The component never accepts, reads, serializes, or logs a private key. Signing is always delegated to the injected wallet (via `WalletStandardSigner` and wallet popups).
- Encryption is performed client-side by `@mysten/seal` before bytes reach Walrus. Ciphertext alone is not enough to decrypt.
- Errors surface user-facing copy via the SDK's `formatUserMessage` and never include signer material.

In scope: logic bugs that cause incorrect on-chain effects, leakage of private material through props/state/errors/logs, missing SSR guards that crash a host app, and accessibility regressions that break keyboard or screen-reader use of interactive controls.

Out of scope: Walrus storage-node availability, Sui validator behavior and gas pricing, Seal key-server availability, and bugs in upstream `@mysten/*` libraries (escalate those to Mysten Labs).

## Versioning and patches

- Pre-1.0 (`0.x.y`): security fixes ship as a `0.x.y` patch.
- Post-1.0 (planned): security fixes ship per [Semantic Versioning](https://semver.org/) with backports to the latest minor of each supported major.
