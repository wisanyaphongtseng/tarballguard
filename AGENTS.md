# B08 — npm Packed Web-Asset Integrity Preflight

## Project Goal

Build a small public experiment that checks an actual npm `.tgz` package before publish.

The tool answers:

> Do literal web asset references inside the packed npm artifact point to files that are actually present in that artifact?

This is a 3-working-day market probe, not a full SaaS product.

The goal is to launch quickly, let strangers scan their own package artifacts, and measure whether the tool is useful and reused.

## Core Product Behavior

User drops an npm `.tgz` file into the browser.

The tool:

1. Reads the archive locally in the browser.
2. Builds an index of files actually contained in the package.
3. Finds supported HTML files.
4. Extracts literal relative asset references.
5. Resolves each reference relative to the referring HTML file.
6. Checks whether the target exists in the packed artifact.
7. Reports FOUND, MISSING, UNKNOWN, or SKIPPED.
8. Checks optional user-declared required files.

The package must never be uploaded to our server.

## Initial Supported References

For v0, inspect literal references from HTML only:

- `<script src="...">`
- `<link href="...">`
- `<img src="...">`

Only confidently resolvable literal relative paths should produce pass/fail results.

Examples:

- `./app.js`
- `../assets/logo.svg`
- `style.css`

## Required Files

The user may provide expected paths such as:

- `dist/index.html`
- `dist/app.js`
- `dist/style.css`

If an expected file is absent from the archive, report it as an error.

This feature is part of the free core checker.

It is required because a completely missing HTML/UI directory would otherwise leave nothing to scan.

## Important Semantics

UNKNOWN is not PASS.

If the checker cannot determine whether a reference should exist inside the archive, report UNKNOWN or SKIPPED with an explanation.

If there are no supported HTML files and the user did not declare expected files, do not say the package passed.

Instead report that the artifact is not auditable under the current supported scope.

## Out of Scope for v0

Do not implement unless explicitly requested later:

- JavaScript import graph analysis
- dynamic imports
- CSS dependency graph
- runtime-generated URLs
- virtual routes
- package installation
- package execution
- lifecycle scripts
- npm registry downloads
- GitHub Action
- CLI
- authentication
- accounts
- database
- package history
- AI fixes
- automatic repair
- release comparison
- billing
- dashboard

Do not expand scope merely because an additional feature looks easy.

## Security Requirements

Treat every `.tgz` as untrusted input.

The implementation must have bounded archive processing.

Protect against at least:

- archive path traversal
- `../` escaping archive root
- malformed archive entries
- excessive decompressed size
- excessive file count
- excessive individual file size
- duplicate paths
- symlink-related ambiguity

Never execute package code.

Never run install scripts.

Never inject package HTML directly into the application DOM.

## Privacy

Analysis should happen locally in the browser.

Telemetry must never contain:

- package contents
- HTML contents
- package filename
- package name
- asset filenames
- internal paths
- required-file values

Only coarse anonymous product events may be collected later.

## Required Test Fixtures

The project must contain deterministic fixtures for at least:

### valid-package

HTML references files that are all present.

Expected result:

- zero missing references
- supported references reported correctly

### missing-reference

HTML contains:

`<script src="./app.js"></script>`

but `app.js` is not packed.

Expected result:

- MISSING
- referring HTML file identified
- literal reference identified
- expected resolved target identified

### missing-required-file

A declared required file such as `dist/index.html` is missing.

Expected result:

- required-file error

### unsupported-reference

Example:

`<script src="/assets/app.js"></script>`

when package-local resolution cannot be proven.

Expected result:

- UNKNOWN or SKIPPED
- never PASS solely because the target cannot be resolved

## Development Rules

Prefer small, testable modules.

Separate:

- archive extraction/indexing
- HTML parsing
- path resolution
- required-file checks
- finding/result model
- UI

Do not mix scanning logic directly into React components.

Use TypeScript.

Avoid introducing dependencies unless they materially reduce implementation risk.

Before adding a dependency, explain why it is needed.

## Definition of Done for Core Engine

The core engine is ready when automated tests prove:

1. missing-reference fixture detects the missing `./app.js`.
2. missing-required-file fixture detects the missing expected file.
3. valid-package fixture produces no false missing-reference finding.
4. unsupported-reference fixture does not incorrectly pass the unresolved reference.
5. malicious or invalid archive paths cannot escape the logical package root.

## Working Style for Coding Agents

Before making substantial changes:

1. Read this file.
2. Read relevant files in `docs/`.
3. Inspect the existing code.
4. State the smallest implementation step needed.
5. Implement only that step.
6. Run relevant tests.
7. Report exactly what changed and what remains.

Do not claim something works unless it was tested.

Do not silently expand product scope.

If requirements are ambiguous, prefer the narrower interpretation that preserves the 3-day experiment.