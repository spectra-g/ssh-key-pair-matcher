# SSH Key Pair Matcher

A small, static browser tool for checking whether an SSH public key and an
OpenSSH private key belong to the same pair.

The repository contains the reproducible Vite/TypeScript baseline, the
browser-local matching engine, and the complete semantic matcher interaction
from Steps 01–08. It includes the finished responsive light/dark visual system,
self-hosted fonts, non-persistent theme control, deterministic visual baselines,
crawlable technical guidance and metadata, privacy audits, a static production
security policy, and exhaustive release quality gates.

## Privacy contract

The finished tool performs matching locally in the loaded browser tab. It has
no API, runtime third parties, analytics, storage, or service worker. Key
material must never enter URLs, logs, browser storage, build output, or network
requests.

Do not use real user keys during development. Tests use only clearly labelled,
disposable fixtures committed under `tests/fixtures/`.

## How privacy is enforced

- **No server or API:** parsing, fingerprinting, and matching execute in the
  loaded browser tab.
- **No runtime third parties:** the page serves its own scripts, styles, fonts,
  images, and metadata, with no analytics, advertising, or remote runtime
  assets.
- **No persistence:** the application does not write keys, results, or theme
  choices to cookies, browser storage, IndexedDB, Cache Storage, URLs, or
  history.
- **Outbound connections are release-blocked:** the static Pages Content
  Security Policy sets `connect-src 'none'` and `form-action 'none'`; browser
  audits also prove the application itself makes no connection or
  form-navigation attempt.
- **The implementation is auditable:** source, disposable fixtures, and privacy
  tests are available in the
  [public GitHub repository](https://github.com/spectra-g/ssh-key-pair-matcher).

Production-preview browser tests instrument `fetch`, XHR, beacon, WebSocket,
EventSource, form navigation, service-worker registration, URL/history
mutation, storage, console output, and all requests while exercising match,
mismatch, errors, theme changes, wipe, reload, back/forward restoration, and
offline-after-load operation. `pagehide` clears key fields before navigation;
the controller also clears them on persisted `pageshow` restoration. Because
browser engines do not expose deterministic back-forward-cache control, the
lifecycle callback has a unit test in addition to the browser back-navigation
check.

**Wipe keys** clears inputs, errors, and derived results from the current tab.
It cannot erase copies held by the operating-system clipboard, browser
extensions, developer tools, screenshots, process memory, or swap.

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

## Production security policy

Cloudflare Pages reads `public/_headers` from the built `dist/_headers`
artifact. It restricts scripts, styles, fonts, images, connections, forms,
framing, browser capabilities, referrers, and MIME sniffing; it also gives only
Vite's content-hashed assets immutable caching. The canonical domain remains
indexable, while the production and branch `pages.dev` aliases receive
`X-Robots-Tag: noindex`. The local header-preview server supports an explicit
`--noindex` mode so ephemeral Quick Tunnel previews receive the same directive
without changing the canonical site's policy.

These rules apply only to static Pages responses. If a Pages Function is ever
added, it must set equivalent response headers itself; `_headers` does not
apply to Function-generated responses.

## Quality gates

Run the fast local and CI gate:

```sh
npm run check
```

It checks formatting, linting, strict TypeScript, 100% global and per-file unit
test coverage, and the production build. Coverage includes every
`src/**/*.ts` file, including unimported files, with no executable-file
exclusions.

Run all deterministic production-build checks:

```sh
npm run verify
```

This adds the complete Chromium, Firefox, and WebKit desktop/mobile browser
matrix, stateful accessibility and privacy checks, and three mobile Lighthouse
runs. Install the matching browser binaries once with:

```sh
npx playwright install chromium firefox webkit
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
- `npm run assert:dist` — validate production metadata, JSON-LD, crawl files,
  source links, privacy copy, runtime origins, executable files, source-map
  hygiene, asset/transfer budgets, 404 page, and social-card dimensions

The production artifact gate limits gzip-compressed first-party JavaScript to
35 KiB, the gzip-compressed initial transfer to 180 KiB, and any individual
asset to 100 KiB. It also rejects unexpected executable files and runtime
third-party origins. Lighthouse uses its mobile defaults for three runs and
requires Performance ≥95 plus Accessibility, Best Practices, and SEO at 100.
Playwright retries are disabled so deterministic failures remain visible.

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
Each key can be pasted, selected with the keyboard-accessible file picker, or
dropped directly onto its field. Selected files are read locally, limited by
the same 64 KiB input cap, and never uploaded. Changing either input invalidates
old results, while **Wipe keys**, `pagehide`, and back-forward-cache restoration
clear the key fields and derived output.

The initial theme follows `prefers-color-scheme`. The accessible theme control
overrides only the current document, continues to follow live system changes
until that override, and never reads or writes browser storage. Manrope and
JetBrains Mono are served locally as variable Latin WOFF2 fonts under the SIL
Open Font License; their license texts are committed under `public/fonts/`.

All committed keys under `tests/fixtures/` are disposable public test material
generated independently with `ssh-keygen`. Never authorize or reuse them.

## Project shape

- `index.html` contains the semantic static page.
- `src/` contains first-party browser TypeScript and CSS.
- `tests/unit/` contains Vitest tests.
- `tests/e2e/` contains Playwright production-build tests and six release
  viewport/theme visual baselines.
- `site.config.ts` is the single source for canonical and repository URLs.
- `scripts/assert-dist.mjs` validates the static launch artifact.

## Repository status

The public source repository is
[spectra-g/ssh-key-pair-matcher](https://github.com/spectra-g/ssh-key-pair-matcher),
and this clone uses it as `origin`.
The canonical site URL is `https://sshkeypairmatcher.com/`.

## License and security

The project is available under the [MIT License](./LICENSE). Extraction-source
credit is recorded in [NOTICE.md](./NOTICE.md). Please read
[SECURITY.md](./SECURITY.md) before reporting a security issue.
