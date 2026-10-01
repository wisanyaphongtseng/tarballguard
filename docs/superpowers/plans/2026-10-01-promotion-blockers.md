# Promotion blockers implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement only section H of the 2026-10-01 adversarial validation.

**Architecture:** Preserve bounded inert HTML parsing and current outcome aggregation. Carry document base-href presence into conservative resolution; measurement consumes only enums and booleans derived from audit evidence.

**Tech Stack:** Existing TypeScript, parse5, React, Vitest; no dependencies.

**Spec:** User-approved section H: base-href affected relative references UNKNOWN; percent-bearing relative URL paths UNKNOWN; correct own artifact / HTML relevance / evidence engagement / later-release measurement; regressions for every reported failure.

## Global constraints
- Do not expand URL semantics or add CSS/JS dependency graphs.
- No CLI, GitHub Actions, billing, accounts, AI, history or product features.
- Never transmit filenames, paths, contents, versions, hashes or error text.
- Preserve supported ordinary relative paths, required-file assertions and NOT_AUDITABLE rules.
- No deployment or merge.

## Review focus
- Inert template/foreign/raw-text base elements must not affect document references.
- Percent characters solely in query/fragment must preserve supported path checks.
- Policy-only success must not count as relevant HTML retention.
- Replacing files must reset ownership and evidence engagement.
- Legacy completion metadata must not establish relevant own-package history.

### Task 1: Conservative reference confidence
**Files:** engine/html-references.ts, html-scan-internal.ts, reference-resolution.ts; resolution/scan tests; new promotion-adversarial fixture/test files; HTML scan/resolution documentation.
**Interfaces:** Add document extraction metadata without changing extractHtmlReferences output; optional base-href context in resolveHtmlReference.
- [x] Port all 57 safe audit fixtures into the existing test runner; change only base/percent expectations. Add inert-base and query/fragment controls.
- [x] Run targeted tests: ten audit regressions must fail on the original code.
- [x] Mark percent-bearing relative path components and otherwise resolvable relative references in base-href documents UNKNOWN without target lookup.
- [x] Run engine tests; all supported-path, policy, archive and outcome controls must pass. Commit.

### Task 2: Correct experiment eligibility
**Files:** measurement/events.ts, experiment.ts; ui/scan-workflow.ts; App.tsx; Onboarding.tsx; measurement unit/browser tests and documentation.
**Interfaces:** Optional own/third_party/unknown provenance per selection; html_present/html_scanned/local_html_reference_checked completion flags; once-per-attempt evidenceOpened action.
- [x] Write regressions for provenance default/reset, policy-only and uninspected HTML, explicit evidence action, relevant-own retention, legacy metadata and payload privacy. Run them RED.
- [x] Implement enum/boolean allowlists, ownership control, evidence link, relevant-own prior/current gating and separate own-policy reuse context. Preserve demo/internal exclusions and optional delivery.
- [x] Update existing contract assertions and browser smoke for the corrected schema. Run measurement/workflow tests GREEN. Commit.

### Task 3: Production readiness
- [x] Run npm test, npm run typecheck and npm run build. All must pass.
- [x] Run adversarial tests explicitly; confirm all 57 cases and additional controls pass.
- [ ] Run native-worker browser measurement smoke: attempted, but browser rejected localhost with ERR_BLOCKED_BY_CLIENT. Not claimed passing; unit transport/body inspections passed.
- [x] Review the whole change independently, fix blockers with RED/GREEN regressions, then stop with a reviewable branch and readiness limitations.

## Verification record

- Baseline: 495 tests passed. Engine RED: 19 failures on original behavior; measurement RED: 20 failures on original behavior/contract.
- Final: 578 tests, typecheck, production build; 65 explicit adversarial tests including all 57 audit fixtures.
- Independent review: no critical or important defects, 255 focused tests passed; schema-copy mismatch corrected.
- Receiver acceptance remains unverified. No deployment or merge is part of this work.
- Implementation ruling: v2 starts fresh cohorts because legacy v1 cannot prove ownership or HTML relevance; costs loss of comparison continuity with legacy usage.
