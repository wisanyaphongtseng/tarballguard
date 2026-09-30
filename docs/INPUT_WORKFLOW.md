# Package input workflow — Day 2 Milestone 8

The single-page input workflow explains literal packed HTML checks and browser-local processing. It accepts one npm `.tgz` via a native picker or drop area, optional required paths, and explicit Scan/Cancel actions. The engine and worker behavior are unchanged. The production build now includes the worker through the actual application client import. No package contents, findings cards, export, sample picker, analytics, or network service are added.

## UI state and worker ownership

`ScanWorkflow` in `src/ui/scan-workflow.ts` keeps a shallow-frozen snapshot with `phase`, selected File, required text, optional PackageAudit, and safe message. React subscribes through `useSyncExternalStore`; one PackageScanClient belongs to the mounted application. States are idle, ready, scanning, completed, error, and cancelled. Scan is disabled without a file and while scanning. The synchronous controller guard prevents double-submit before a React render. Cancel is available only during scanning. Unmount cancels active work.

The File is sent directly to the existing worker client. No main-thread package read, extraction, or path logic occurs. Completion retains the full immutable PackageAudit in application state for Milestone 9, but renders only "Scan complete", the exact outcome, and a temporary report placeholder. Coverage-limited and not-auditable results remain completed scans; no outcome is converted to generic PASS/FAIL or a runtime guarantee.

Selecting a replacement or removing a file cancels active work and clears old result/error state. A generation counter prevents late promises from restoring stale state. Starting another scan also clears stale state. Cancel shows a neutral cancelled message and retains the selected File for retry. Required text is disabled during scanning; editing it afterward clears stale results. File replacement/removal keeps required text. Closing a picker without selecting a file keeps the current selection.

## File selection and policy text

The native picker accepts `.tgz`, with no multiple selection. Drop handling explicitly rejects multiple files; filenames with `.tgz` are recognized case-insensitively. This extension check is only input guidance, never a security boundary: arbitrary bytes named `.tgz` reach authoritative archive validation in the worker. No file is analyzed until Scan is selected.

The selected filename and binary-unit size are shown as React text. Control and bidi characters in filenames are displayed as literal Unicode escapes; the original File is unchanged. No package payload is inserted into the DOM.

Required text splits on CRLF, LF, or CR. Whitespace-only lines are ignored. Every remaining line is passed unchanged, including surrounding spaces, case, Unicode, percent sequences, unsafe syntax, and duplicates. The UI does not normalize or deduplicate paths. Preserving spaces follows the frozen policy contract, where spaces can be literal filename characters. The help text states this deliberately. Existing engine validation rejects invalid policy with INVALID_POLICY; the UI never converts it to a missing-file finding.

## Errors and accessibility

The UI maps typed ScanError codes to fixed, concise messages for unsupported formats, unsafe/conflicting paths, malformed gzip/TAR, limits, invalid policy, timeout, cancellation, unreadable files, unsupported browser features, and unexpected failures. Raw exception messages, stacks, and archive contents are not rendered. Existing 30-second timeout and termination behavior are preserved.

The drop area is a native button, so click, Enter, and Space open the picker. Native buttons provide Scan, Cancel, and Remove. Required text has an associated label and help text. A persistent `role="status"`, polite aria-live, atomic status region announces lifecycle updates. Focus outlines are visible. Status uses text rather than color alone. The centered layout adapts to narrow screens without animations or external fonts.

## Verification scope

`tests/scan-workflow.test.ts` covers selection/removal, disabled scanning, policy serialization, submission guard, result retention, safe errors, cancellation, stale replies, resets, subscriptions, size formatting, and filename display. These are controller tests, not fabricated DOM/browser tests, and require no new dependency.

The development-only `/tests/browser/input-smoke.html` page mounts the real application with real Edge workers. It supplies deterministic File objects through browser DataTransfer/drop events and native input change events, edits the real textarea, clicks real controls, and checks outcomes, invalid policy, malformed input, cancellation/retry, coverage results, responsiveness, and resource URLs. It does not claim an OS drag gesture or native dialog selection. The smoke page and embedded fixture data are not production build entries.

Native file-chooser opening is verified separately. Automated local-path selection may require the browser extension's file-URL permission; that permission is not changed by this milestone. Timeout messages are exercised in unit tests rather than forcing the real browser to consume 30 seconds. Resource timing and code review verify local asset requests and absence of upload code; this is not a full network packet capture.

Run `npm test`, `npm run typecheck`, and `npm run build`. Detailed findings and report controls remain deferred to Milestone 9.

Verified in Edge against Vite: application load, click/Enter picker opening with single selection, textarea entry, browser drop/change events, selected filename/size, real missing-reference worker outcome, invalid-policy and malformed-archive messages, Cancel/retry, removal, and successful coverage-limited completion. The main-thread heartbeat advanced 197 times during the busy scan. Resource timing showed only local application/worker assets; browser logs had no errors or warnings. A 390-pixel viewport override showed no horizontal overflow (375 CSS pixels of content with the scrollbar). The override was reset after checking.

Native picker file assignment through automation was blocked by the Edge extension's file-URL permission. No permission was changed; native opening and the actual input change handler were checked separately. The drop test uses browser events, not a physical OS file drag. The final automated suite passed 396 tests, typecheck, and production build. Engine and worker source files were not changed.
