# Package audit report — Day 2 Milestone 9

`src/ui/AuditReport.tsx` presents the completed PackageAudit already held by the input workflow. It performs no scanning, resolution, archive lookup, or outcome calculation. Engine and worker code are unchanged. The input form remains available for replacement, policy edits, and rescanning. The existing workflow clears the report on selection, removal, policy edits, or scan start and ignores stale asynchronous completions.

## Outcome and counts

The report preserves the four engine outcomes:

- ISSUES_FOUND: "Missing packed files were found."
- CHECKED_NO_ISSUES: "No issues found in the checks that were performed."
- CHECKED_WITH_UNKNOWNS: "No definite missing file was found, but some references or files could not be fully checked."
- NOT_AUDITABLE: "The audit could not perform a package-local check with the current rules."

Every outcome includes the static packed-artifact limitation: no runtime correctness guarantee. NOT_AUDITABLE explains unavailable checks using the supplied summary and suggests declaring expected files. Unknown outcome values receive an explicit unrecognized-result message, never a clean label.

Missing, Unknown, Found, Skipped, checked assertions, HTML scanned/discovered, and nonzero coverage-gap counts come directly from `audit.summary`. Required-file checks are included in those totals. Coverage gaps remain separate from Unknown reference findings. Invalid numeric counts display "Unavailable" rather than invented totals. Presentation grouping does not change audit counts or outcomes.

## Findings and priority

Missing HTML references show source path, reliable one-based line/column, tag/attribute/literal evidence, expected packed target, and an explicit missing label. Required-file results include both statuses, with missing entries first. The report section order is missing assets, coverage limitations, unknown references, required package files, validated references, then outside-package-local checks.

Coverage limitations show the unscanned path, existing safe engine reason, and typed code, with an incomplete-inspection explanation. Unknown references retain the resolver reason and explain uncertainty without implying a definite issue. Found references show source, literal, target, and presence. Skipped references appear in a lower-priority native disclosure with an explicit outside-package-local-checking explanation. Empty sections are omitted. Source order is retained within each status group; required findings retain order within their status groups.

Each list initially renders at most 50 entries. Larger lists state "Showing X of Y" and provide a native button to reveal the next 50 or remaining entries. All retained findings can be revealed; there is no silent truncation and no altered engine count. Revealing all large results can still use substantial browser DOM memory. This milestone adds no filtering, sorting controls, export, history, or sample picker.

## Text safety and accessibility

The office-style presentation uses one report surface with divided sections. Desktop rows align reference evidence with the expected packed target; mobile rows stack in reading order. Summary tiles use the supplied counts, including a nonzero coverage-gap tile. "Validated references" means packed-file presence only. The presentation changes no scan behavior, finding order, outcome semantics, or privacy boundaries.

All package paths, references, and filenames are React text. No package value becomes an HTML element, URL attribute, or clickable link. Diagnostic syntax such as `<script src="./app.js">` is a text string in a code block, not reconstructed active markup. The attribute value is the parser-decoded literal from the engine; the display is diagnostic notation, not an exact quotation of the original source spelling. HTML entities are not decoded again. Control and bidi characters receive visible Unicode escapes through the existing display helper; underlying audit values remain unchanged.

Code blocks wrap long text and scroll vertically within bounded height. Report lists, headings, labels, and native disclosure/buttons remain keyboard accessible. Color reinforces explicit textual states. The existing polite, atomic scan status announces completion and outcome; the entire report is deliberately outside that live region to avoid announcing thousands of rows.

## Verification

`tests/AuditReport.test.tsx` uses React's existing static renderer and actual engine-produced results, including the deterministic missing-reference `.tgz`. It covers outcomes, evidence/location, required statuses, coverage, unchanged reasons, empty sections, authoritative summary counts, malicious markup, inert URL schemes, long/control text, duplicate order, initial row budget, defensive presentation, reset/rescan, and semantic structure. No test dependency is added.

`/tests/browser/report-smoke.html` is a development-only harness mounting the real application and module worker. Its deterministic fixtures are generated by `tests/browser/generate-report-fixtures.mjs` using the existing test archive builder. It verifies missing, required, clean, unknown, not-auditable, and coverage results; rescan/reset; revealing additional rows; hostile strings; and absence of resource elements or nonlocal resource timing entries. File input is exercised through real browser File/DataTransfer events, not a physical OS drag or native dialog assignment. The harness and fixtures are not production entries. Resource timing plus code review is evidence of no upload/resource-loading path, not a packet capture or security proof.

Verified in Edge against Vite: all six report scenarios, missing-reference source location, required statuses, conservative clean wording, unchanged uncertainty, explicit complexity coverage gap, report resets/rescan replacement, 50/51-row reveal, malicious text, and inert javascript/data/external references. Captured browser logs contained no warnings or errors. Resource timing showed local application/worker assets only. A temporary 390 × 844 viewport override showed 375 CSS pixels of width and scroll width, with no horizontal overflow even for 3,000-character references; the override was reset.

Verification commands: `npm test` passed 418 tests (22 new report tests); `npm run typecheck` and `npm run build` passed. The production build retains a separate worker asset. No dependency, engine, or worker source file changed.

UI-polish verification: 493 tests, typecheck, production build, and `git diff --check` pass. Edge report, onboarding, and mocked measurement harnesses pass with the updated labels. Desktop evidence alignment and keyboard reset focus were inspected. At 320 and 390 pixel viewport overrides, page width equals scroll width; the 390 pixel report includes a 3,018-character diagnostic block. Overrides were reset. Captured browser warnings/errors were empty. Engine, worker, measurement, and workflow-controller source files remain unchanged; no dependency was added.
