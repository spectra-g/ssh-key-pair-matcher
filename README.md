# SSH Key Pair Matcher

A small, static browser tool for checking whether an SSH public key and an
OpenSSH private key belong to the same pair.

The repository currently contains the reproducible Vite and TypeScript
baseline from Step 01. Key parsing and the complete user interface are
implemented in later planned steps.

## Privacy contract

The finished tool performs matching locally in the loaded browser tab. It has
no API, runtime third parties, analytics, storage, or service worker. Key
material must never enter URLs, logs, browser storage, build output, or network
requests.

Do not use real user keys during development. Tests added in later steps use
only clearly labelled, disposable fixtures committed under `tests/fixtures/`.

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
