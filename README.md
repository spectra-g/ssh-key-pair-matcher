# SSH Key Pair Matcher

A small, static browser tool for checking whether an SSH public key and an
OpenSSH private key belong to the same pair.

The repository contains the reproducible Vite/TypeScript baseline, the
browser-local matching engine, and the complete semantic matcher interaction
from Steps 01–03. The visual system and supporting launch content are delivered
in later planned steps, so the current styling is intentionally functional.

## Privacy contract

The finished tool performs matching locally in the loaded browser tab. It has
no API, runtime third parties, analytics, storage, or service worker. Key
material must never enter URLs, logs, browser storage, build output, or network
requests.

Do not use real user keys during development. Tests use only clearly labelled,
disposable fixtures committed under `tests/fixtures/`.

## Prerequisites

- Node.js `22.16.0`, exactly
- npm (the version bundled with that Node release)

The Node version is pinned in `.nvmrc`, `.node-version`, and
`package.json#engines`. With nvm:

```sh
nvm install
nvm use
```

## Install and run

Install exactly the dependency graph in `package-lock.json`:

```sh
npm ci
```

Start the development server:

```sh
npm run dev
```

Create and locally serve a production build:

```sh
npm run build
npm run preview
```

Vite writes the static deployment artifact to `dist/`.

## Quality gates

Run the fast local and CI gate:

```sh
npm run check
```

It checks formatting, linting, strict TypeScript, 100% unit-test coverage, and
the production build.

Run all deterministic production-build checks:

```sh
npm run verify
```

This adds Chromium browser smoke, accessibility, privacy, and Lighthouse
checks. Install the matching browser binary once with:

```sh
npx playwright install chromium
```

Individual scripts are available for focused work:

- `npm run format:check` — check formatting
- `npm run lint` — run ESLint
- `npm run typecheck` — run strict TypeScript checks
- `npm test` — run unit tests once
- `npm run test:coverage` — enforce coverage thresholds
- `npm run test:e2e` — run production-build browser smoke tests
- `npm run test:a11y` — run the production-build axe smoke test
- `npm run test:privacy` — check the baseline for third-party requests and
  persistence
- `npm run test:lighthouse` — run local Lighthouse CI assertions

Re-check the committed disposable SSH fixtures against the operating system's
independent OpenSSH implementation:

```sh
./scripts/verify-fixtures.sh
```

## Matching engine

The modules under `src/core/` parse OpenSSH public lines and the outer header of
OpenSSH v1 private-key containers. They support Ed25519, RSA, and ECDSA P-256,
P-384, and P-521. Encrypted OpenSSH private keys can be matched without a
passphrase because their public component is part of the unencrypted outer
container; the private payload is never decrypted.

Inputs are capped at 64 KiB and decoded key blobs at 32 KiB. Parsing uses
bounded SSH wire reads, canonical base64 and mpint validation, exact algorithm
structure checks, and full-buffer consumption. Unsupported PKCS#1, PKCS#8, PEM
EC, PuTTY PPK, certificate, security-key/FIDO, and multi-key container formats
are rejected with fixed messages that do not include pasted material.

SHA-256 is the primary fingerprint. MD5 is calculated with the pinned,
browser-compatible `@noble/hashes` package and displayed solely for legacy SSH
fingerprint comparison; MD5 is not a security recommendation.

The semantic form in `index.html` is progressively enhanced by
`src/ui/matcher-controller.ts`. Checking occurs only after explicit submission.
Changing either input invalidates old results, while **Wipe keys**, `pagehide`,
and back-forward-cache restoration clear the key fields and derived output.

All committed keys under `tests/fixtures/` are disposable public test material
generated independently with `ssh-keygen`. Never authorize or reuse them.

## Project shape

- `index.html` contains the semantic static page.
- `src/` contains first-party browser TypeScript and CSS.
- `tests/unit/` contains Vitest tests.
- `tests/e2e/` contains Playwright production-build tests.
- `site.config.ts` is the single source for canonical and repository URLs.

## Repository status

No Git remote is configured yet. The final public repository URL is therefore
intentionally unset in `site.config.ts` and is not displayed by the site.
Configure and verify the public `origin` before adding that URL.

The canonical site URL is `https://sshkeypairmatcher.com/`.

## License and security

The project is available under the [MIT License](./LICENSE). Extraction-source
credit is recorded in [NOTICE.md](./NOTICE.md). Please read
[SECURITY.md](./SECURITY.md) before reporting a security issue.
