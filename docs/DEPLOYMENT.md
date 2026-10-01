# Production deployment and launch acceptance

## Current release status

**Prepared locally; not publicly launched.** Milestones 1–11 are committed. The engine and browser worker remain frozen. There is no Git remote or public repository URL. No production Vite configuration is present. GitHub CLI authentication was verified; the existing Cloudflare OAuth account-access check returned HTTP 403, so usable deployment access is not established. No Pages project, public deployment, or live PostHog receipt has been verified.

Launch date: **pending successful public production acceptance**.

Observation window: **30 calendar days after that launch date**. Do not start the clock from a local build or preview. Existing experiment definitions and decision gates remain authoritative; this document adds no new thresholds or scheduling code.

## Cloudflare Pages setup

Use a Git-integrated **Pages static site**, with these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `24.15.0`, pinned in `.nvmrc` |

No Pages Functions, Cloudflare Workers application, backend, or alternate hosting is required. The browser module worker is a static JavaScript asset, not a Cloudflare Worker. Keep Cloudflare Web Analytics and Zaraz disabled: B08 uses only its explicit custom capture events.

The settings follow [Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/) and [build-image version selection](https://developers.cloudflare.com/pages/configuration/build-image/).

Configure these **production build variables**, by name:

- `VITE_SOURCE_REPOSITORY_URL`: the actual public HTTPS repository containing this release. Verify public access and the source link after building. Do not invent a URL.
- `VITE_POSTHOG_PROJECT_TOKEN`: the client-visible project capture token. Never use a PostHog personal API key.
- `VITE_POSTHOG_HOST`: the intended HTTPS ingestion origin, without credentials, extra path, query, or fragment.

Vite embeds these public values during the build. Changes require a new build/deployment. Do not commit real values; `.env` and `.env.*` are ignored, except the blank `.env.example`. Missing analytics configuration or an invalid/non-HTTPS host disables measurement without breaking scanning. Missing or invalid source configuration falls back to the known public repository, https://github.com/wisanyaphongtseng/tarballguard. Valid HTTPS configuration still overrides it.

## Exact manual prerequisites

1. Select/create the actual public GitHub repository and attach it as the Git remote. The CLI has an authenticated account, but no repository destination is configured. Push the committed `main` branch to that destination.
2. Sign in to the intended Cloudflare account with Pages access, then connect that repository using the settings above. Existing local OAuth credentials did not pass the account-access probe; do not paste credentials into logs or documentation.
3. Obtain the intended PostHog project's capture token and HTTPS host in its dashboard. Configure all three Vite values in Pages production settings. No personal API key is needed.
4. Deploy, record the real HTTPS URL and deployed commit, then perform every public acceptance check below. A locally successful build does not complete this milestone.

## Static security headers

`public/_headers` is copied unchanged into `dist/_headers`. For all static responses it sets:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

These restrict MIME guessing, referrer disclosure, and unused sensitive browser capabilities without restricting module-worker loading or HTTPS capture. See [Cloudflare static header handling](https://developers.cloudflare.com/pages/configuration/headers/).

A CSP is deliberately deferred until the actual PostHog host is known. Do not add a guessed `connect-src` or broadly allow arbitrary hosts. Any later CSP must be checked against same-origin app assets and module workers, and the exact configured capture origin. Local header testing does not verify Cloudflare's deployed responses; verify those on the public URL.

## Clean local acceptance

Start from a committed clean tree. Stop local Vite processes before reinstalling on Windows, because they can hold the native Rolldown DLL open. Run:

```sh
npm ci
npm test
npm run typecheck
npm run build
git diff --check
```

Inspect `dist/`: it should contain `index.html`, `_headers`, hashed application JavaScript/CSS, and a separate `scan.worker-*.js`. No `.tgz` files, development harnesses, local environment files, source maps, local filesystem paths, or development server URLs should appear. The intentional embedded synthetic demo is allowed; it contains no private package code. Scan tracked history and output for obvious credential patterns without printing matching values. Such inspection is not proof that every possible secret is absent.

For an Edge check of the exact local production output with the same header values:

```sh
node tests/browser/production-preview.mjs
```

This is local test tooling only, not a deployed server. Open the printed localhost URL. Local telemetry is disabled by design. Unit tests cover environment rejection and all frozen outcomes, but do not substitute for production PostHog receipt.

## Public HTTPS acceptance checklist

Ordinary acceptance uses `?internal=1`, verifying that the parameter disappears and local exclusion persists. Use only synthetic deterministic fixtures, never private packages.

- Confirm title, description, source link/public repository, no console errors, responsive layout, keyboard controls/focus, static header responses, and a loaded native module worker.
- Run **Run sample scan**: FOUND `style.css`, MISSING `app.js`, source `index.html:2:9`, no real experiment events.
- Select/drop the deterministic missing-reference fixture as user input. Check details, reset, replacement, and rescan. Do not assume a demo scan tests user-source measurement.
- Check required `style.css` FOUND, missing `dist/index.html` MISSING, and explicit safe error for `../unsafe` policy.
- Exercise all four outcomes using existing deterministic fixtures: missing, clean supported artifact, local check plus root-relative UNKNOWN, and no usable assertion. No generic pass or runtime-correctness claim is allowed.
- Exercise an existing bounded complexity/coverage fixture. It must show a coverage gap and cannot produce a clean result. Do not run an unbounded stress test on production.
- Inspect DevTools Network for package uploads or package-derived resource loads. Inspect actual capture JSON for only the documented booleans/enums, random cohort, project token, and fixed anonymous flags. No filenames, package identifiers, paths, HTML, literals, required values/digests, bytes, findings, messages, or stacks may appear. This is DevTools evidence, not packet-level verification.
- Clear exclusion using `?internal=0`; verify the query disappears. Make **one known synthetic real scan** without required policy to limit receipt testing to start/completion. Verify `b08_real_scan_started` and `b08_real_scan_completed` in the intended PostHog project, including property allowlists. Record this known synthetic test scan when interpreting metrics; do not call it real adoption.
- Re-enable internal mode for other tests. Verify demo/internal exclusion and blocked analytics without changing scan outcomes. Do not generate fake production reuse, retention, or paid-interest events. Those flows already have isolated mock tests; any live intent testing needs a deliberately separate test project/dataset.

Measurement definitions remain in [EXPERIMENT_MEASUREMENT.md](EXPERIMENT_MEASUREMENT.md): corrected reruns are not retention, later releases require explicit confirmation, paid-interest clicks are not payment evidence, and browser cohorts are approximate.

## Release record

Local preparation verified on 2026-10-01: clean dependency installation, 492 tests, typecheck, production build, and diff whitespace checks passed. Obvious credential-pattern inspection covered all 14 existing commits and the five generated static files without printing values; `.env.example` is the only tracked environment file and its values are blank. Ignored real environment-file paths were checked. The production output contains no `.tgz`, source maps, development-server URLs, local filesystem paths, or development harness entry.

Edge against local production preview with the header values applied verified title/landing copy, native worker example findings and source location, required FOUND/MISSING, safe invalid-policy handling, keyboard example/reset, and no horizontal overflow at a 390 × 844 viewport (375 CSS-pixel client/scroll widths). Console logs contained no warnings/errors. HTTP checks confirmed all three headers. Source-link correctness, public HTTPS behavior, live analytics payloads/receipt, and production exclusions remain **pending**, not passed by these local checks. No production analytics events were generated.

After successful production acceptance, record the deployed commit/branch, repository URL, public HTTPS URL, configured variable names only, browser/header checks, live receipt and payload inspection, exclusions, command results, known limitations, and actual launch date. Until then, leave all public acceptance and launch fields pending. Only then report `B08 V0: PUBLIC EXPERIMENT LAUNCHED` and stop development.
