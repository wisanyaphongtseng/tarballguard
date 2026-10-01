# Section H promotion readiness — 2026-10-01

Implementation is ready for review. Public promotion readiness is still conditional on production acceptance; this work does not deploy or merge.

## Scope implemented

Only the requested confidence and measurement blockers were changed. No URL decoding/base resolution, CSS/JS graph, CLI, Actions, accounts, history, AI or billing was added. Archive bounds, worker deadlines and outcome aggregation are unchanged.

| Reproduction | Corrected result |
| --- | --- |
| `local-base-wrong-target-present`: base targets assets/, but only sibling app.js exists | UNKNOWN with no target; NOT_AUDITABLE, never CHECKED_NO_ISSUES |
| Other local/remote/root base href cases | Affected relative references UNKNOWN; absolute/remote classification preserved |
| Encoded space, Unicode name, literal encoded filename, encoded parent/dot escape and malformed percent | UNKNOWN with no target, irrespective of filename membership |
| Percent solely in ordinary reference query/fragment | Ordinary supported target check preserved |
| Found required file alongside UNKNOWN HTML references | CHECKED_WITH_UNKNOWNS; absent required file still ISSUES_FOUND |
| No HTML and no required files | NOT_AUDITABLE unchanged |

The same inert parse supplies document base presence. Bases in template content, foreign namespaces and raw-text strings do not affect document resolution; base target without href remains supported. No package code is executed and no referenced resources are loaded.

## Measurement review

Ownership is optional and explicitly defaults to unknown per selected file. Completion records HTML present, HTML scanned, and actual FOUND/MISSING HTML reference evidence separately from required assertions. Intentional View evidence activation emits once per attempt; rendering the report does not emit engagement.

Later-release confirmation requires prior and current relevant self-reported own HTML scans plus explicit Yes. Unknown-origin, third-party, policy-only, uninspected/unsupported HTML, first, failed and demo attempts cannot qualify. Own-policy reuse retains its existing different-visit/30-minute rule and separately records prior/current HTML relevance. Legacy v1 cannot establish corrected eligibility; v2 starts fresh anonymous cohorts. This intentionally loses legacy cohort continuity.

Event construction and transport allowlist enums and booleans. Tests inject filenames, paths, HTML/content, versions, hashes/digests and error text into caller objects and inspect serialized requests. These values do not reach capture. Policy comparison digests remain local; anonymous cohort IDs are random, not package-derived. Demo/internal/local-development exclusions, request caps/deadlines and noncritical delivery remain intact.

## Verification

- Clean baseline: 495 tests passed.
- Regressions observed failing before implementation: engine 19; measurement 20 (including corrected contracts).
- Full suite: 578 tests across 18 files passed; typecheck and production build passed.
- Explicit adversarial run: 65 tests passed, comprising every one of the original 57 safe audit cases plus eight base controls. Fixtures use actual deterministic TAR/gzip bytes; no install/lifecycle scripts.
- Independent review: no critical/important code defects; 255 focused tests passed. One event-description mismatch was corrected.
- Browser smoke source was updated for actual native workers, ownership reset, unknown/third-party/policy-only exclusions, the known base false-clean, encoded-space/name, evidence action, and forbidden payload values. Execution was attempted but the available browser blocked localhost with ERR_BLOCKED_BY_CLIENT. This browser check is not claimed passing.

## Production acceptance still unverified

Live PostHog receiver acceptance was not observed; unit/mock transport proves filtering and eligibility, not project receipt. Updated browser smoke and deployed capture receipt/payload inspection remain acceptance gates before traffic. No public deployment, production configuration, merge or promotion was performed. Ownership/later-release answers remain self-reported, browser cohorts approximate people, and best-effort delivery can lose events.
