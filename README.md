# npm Packed Web-Asset Preflight

B08 is an experimental v0 browser-local checker for the npm `.tgz` you are publishing. It finds literal HTML references to files absent from that packed artifact, even when those files exist in your repository.

For example, a package containing `index.html` and `style.css` can still reference `./app.js` without packing it. B08 reports FOUND `style.css` and MISSING `app.js`, with the referring HTML path and source location. **Try example** scans a tiny synthetic archive through the same worker and engine as a selected package. It contains no third-party package code and is visibly labelled as a demo.

## Use it

1. Run `npm pack` in your package directory. `npm pack --dry-run` previews the file list but does not create the archive to scan.
2. Select or drop the actual `.tgz` into B08.
3. Optionally list required package-relative files, one per line, such as `dist/index.html`.
4. Scan and inspect missing files, verified paths, uncertainty, and coverage limitations. Use **Scan another package** to reset.

Required paths are relative to the stripped `package/` root. Blank lines are ignored; other lines, including spaces and duplicates, go unchanged to engine validation. Matching is case-sensitive. B08 does not run npm commands.

## Scope and outcomes

Supported packed `.html` / `.htm` files are inspected for literal `script[src]`, `link[href]`, and `img[src]` references. Safely resolved relative targets are checked against actual regular files in the archive. Optional required-file checks also work when no HTML is packed.

- **ISSUES_FOUND:** definite missing packed files were found.
- **CHECKED_NO_ISSUES:** no issues found in the checks performed.
- **CHECKED_WITH_UNKNOWNS:** checks were performed, but some references or files could not be fully checked.
- **NOT_AUDITABLE:** no package-local assertion could be checked with the current rules.

FOUND proves packed-path presence only. UNKNOWN is uncertain coverage; SKIPPED is outside package-local checking. Zero checks never produce a clean result. Static checks do not guarantee runtime correctness or replace integration/smoke tests.

## Privacy and limitations

Processing occurs locally in a browser Web Worker. B08 does not upload package contents, execute package code, run install scripts, or render package HTML. Optional PostHog measurement sends only explicitly allowed coarse usage events and a random browser-local identifier. Events contain no filenames, paths, references, package contents, or required-file values. Application files and coarse usage metrics may leave the browser; package data stays local. There is no backend, registry lookup, or account system.

Measurement is disabled without `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`, and always disabled in development and on localhost. The host must be an HTTPS origin. Use `?internal=1` to exclude founder traffic on a public build; this stores a local flag and removes the query parameter. `?internal=0` clears that flag. Demo scans send no experiment events. See [measurement and local storage](docs/EXPERIMENT_MEASUREMENT.md). No SDK, autocapture, replay, identification, or person profiles are used.

- Some TAR/PAX/GNU variants are unsupported, including npm archives requiring extended headers for Unicode or very long filenames. Rejection does not mean the package is broken.
- Bounded processing can conservatively reject unusual HTML or oversized archives/files. Rejected HTML appears as an explicit coverage gap.
- Root-relative, template, and runtime-dependent references may be UNKNOWN. External URLs are not verified.
- Runtime-generated paths, JavaScript imports, CSS dependency graphs, `srcset`, virtual routes, install/runtime behavior, and document-level base semantics are outside v0 scope.
- Paths remain case-sensitive; percent escapes are literal, without URL decoding or Unicode normalization.

See [archive limits](docs/ARCHIVE_INGESTION.md), [HTML bounds](docs/HTML_HARDENING.md), and [outcome semantics](docs/PACKAGE_AUDIT.md).

## Run locally

Use Node.js 24.15.0 or newer and npm:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To prepare a source link, set `VITE_SOURCE_REPOSITORY_URL` to the real public HTTPS repository URL in a local `.env` file before building; see `.env.example`. Blank or invalid URLs show a pending-source message rather than an invented link. Vite variables are public; do not put secrets in them.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

The build produces static files in `dist/`, including a separate module worker. Deployment is not part of this milestone.

## Architecture and tests

- `src/engine/`: bounded gzip/TAR ingestion, HTML parsing, literal resolution, required-file checks, and package audit composition. The engine is frozen.
- `src/worker/`: typed messages, engine execution, transferable input, cancellation, a 30-second safety timeout, and result immutability. Worker behavior is frozen.
- `src/ui/`: input lifecycle, synthetic demo, onboarding, and text-only audit report.
- `src/measurement/`: allowlisted direct capture, anonymous browser cohort, local-only policy comparison, and optional experiment prompts. Delivery failures never affect scanning.

Vitest tests cover malformed/malicious archives, parser hardening and budgets, path resolution, outcomes, worker lifecycle, UI state, safe report rendering, and onboarding. Deterministic fixtures include missing references and required files. Development-only pages under `tests/browser/` exercise the real app and workers in a browser; they are not production entries. Unit transport doubles are not substitutes for browser verification.

This public experiment checks a narrow packed-artifact problem. It is not complete npm validation, a dependency graph analyzer, or a runtime test suite.
