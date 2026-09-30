# Package audit composition — Day 1 Milestone 6

```ts
auditPackage(index: ArchiveIndex, requiredPaths?: readonly string[]): PackageAudit
```

Pass an index returned by successful ingestion. The synchronous API checks the required-file policy, discovers all supported regular HTML files, calls the existing single-file scanner, and reports findings, coverage, counts, and one of four audit outcomes. Omitted or empty required-file policy is valid. No archive is re-read, package code executed, network resource loaded, or UI updated.

## Result and immutability

The result contains `outcome`, `requiredFileFindings`, `htmlFindings`, `htmlFilesScanned`, `htmlCoverageIssues`, and `summary`. All result objects and arrays are frozen, including findings, reference objects, locations, and coverage issue records. Existing findings and references are preserved without reinterpretation or copying. No package payload bytes are returned.

Public types are `PackageAudit`, `AuditOutcome`, `AuditSummary`, and `HtmlCoverageIssue`. A coverage issue contains only `htmlPath`, `code` (`HTML_TOO_LARGE` or `INVALID_UTF8`), and an explanatory `reason`. The successful `htmlFilesScanned` list includes files with zero supported references. Unscanned supported files are identified by coverage issue paths.

## Exact outcome decision table

Apply these rules in order:

| Condition | Outcome |
| --- | --- |
| Any required-file or HTML asset MISSING | ISSUES_FOUND |
| Zero checked package-local assertions | NOT_AUDITABLE |
| At least one checked assertion, no MISSING, and UNKNOWN findings or HTML coverage issues | CHECKED_WITH_UNKNOWNS |
| At least one checked assertion, no MISSING, no UNKNOWN, and no HTML coverage issues | CHECKED_NO_ISSUES |

A checked assertion is one FOUND or MISSING finding from either required-file checking or HTML asset scanning. MISSING is a definite issue even when unknowns or coverage gaps exist. UNKNOWN and SKIPPED do not count as checked assertions. SKIPPED does not downgrade an otherwise checked audit, because those references are deliberately outside package-local validation.

CHECKED_NO_ISSUES means only: "No issues were found in the checks B08 successfully performed." It does not mean that the package works at runtime, is complete, or has had every web asset analyzed. It does not replace smoke or integration testing. There is no generic PASS/FAIL boolean. Zero observed errors with zero checked assertions is NOT_AUDITABLE.

## Findings and counts

`summary` contains:

- `found`, `missing`, `unknown`, and `skipped`: finding counts across both required-file and HTML finding arrays.
- `checkedAssertions`: exactly `found + missing`.
- `htmlFilesDiscovered`: supported regular HTML file count.
- `htmlFilesScanned`: successfully scanned HTML file count, including files with no references.
- `htmlFilesNotScanned`: coverage issue count.

Coverage issues are not fabricated UNKNOWN reference findings and are not included in `summary.unknown`. They independently affect the outcome through `htmlFilesNotScanned`. In a returned result, discovered HTML count equals scanned plus not-scanned HTML count.

Each separate HTML source reference remains a separate assertion when FOUND/MISSING, even if multiple references target the same file. Required policy entries use the existing canonical deduplication; duplicate required paths count once. A required-file assertion and an HTML reference to the same file are distinct checks and both count.

## Discovery and ordering

`isSupportedHtmlPath` is the tiny shared extension helper used by `scanHtmlFile` and package discovery. It recognizes `.html` and `.htm` case-insensitively; full path matching remains exact and case-sensitive. Discovery uses only ingestion's regular `index.files`; HTML-named directories and other file extensions are excluded.

HTML paths are sorted by JavaScript code-unit order before scanning. Successful path lists and coverage issue lists retain that order. HTML findings are grouped by referring path in that order, with extraction source order preserved within each file. Findings are not deduplicated or sorted by target path. Required findings retain the required checker’s existing canonical path order. The caller's index and policy arrays are not mutated.

## Policy errors and HTML coverage

`checkRequiredFiles` runs first. Unsafe paths or invalid policy input propagate as `RequiredFilePolicyError`; no audit result or partial HTML work is returned for an invalid policy.

Only recognized extraction limitations `HtmlExtractionError` with code `HTML_TOO_LARGE` or `INVALID_UTF8` become per-file coverage issues. Scanning continues with other supported files. The 1 MiB HTML cap and strict UTF-8 policy remain unchanged. A known scan failure cannot yield CHECKED_NO_ISSUES, even when other files are clean or required files are found.

Unexpected errors propagate, including generic errors, range errors, `HtmlScanError`, and extraction `INVALID_INPUT`. Those indicate programmer/invariant failures under a trusted ingestion index and must not be hidden as coverage issues. The composition returns no partial audit result for such failures.

## Verification and limitations

Tests reuse the checked-in deterministic `tests/fixtures/missing-reference.tgz`. Its audit reports ISSUES_FOUND, FOUND `style.css`, MISSING `app.js`, and exactly two checked assertions. Tests cover clean local checks, required-file checks, zero-check cases, unknowns, skipped references, coverage failures, precedence, ordering, counts, freezing, and unexpected-error propagation.

All existing archive, extraction, and resolver limitations remain: PAX/GNU extensions are unsupported; only literal script/src, link/href, and img/src evidence is inspected; percent sequences remain literal; document-level `<base>` and runtime behavior are not inferred. Audit outcomes describe this logical supported scope, not runtime correctness. The input index must come from successful ingestion; fabricated indexes are not validated.

No dependencies, workers, UI, telemetry, CSS/JavaScript scanning, registry lookup, CLI, backend, or repairs are added. Run `npm test`, `npm run typecheck`, and `npm run build`.
