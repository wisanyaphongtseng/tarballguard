# B08 30-day experiment measurement

Section H corrects narrow optional measurement; worker and archive behavior remain unchanged. No deployment is performed. The experiment asks whether people scan real artifacts, perform supported checks, reuse policies, return for later release candidates, and express interest in a possible local release workflow.

## Integration and configuration

The browser sends explicit custom JSON events directly to PostHog's `/i/v0/e/` endpoint. There is no analytics SDK or automatic page, click, form, error, replay, heatmap, survey, or feature-flag capture. No identify, alias, or login calls exist. Configuration uses public Vite variables `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`. The host must be an HTTPS origin without credentials, path, query, or fragment. Missing/invalid configuration disables measurement. Development and localhost are always excluded, including preview on localhost.

Each request contains only `api_key`, `event`, `distinct_id`, and the allowlisted `properties`. The distinct ID is a random browser cohort. Fixed properties `$process_person_profile: false` and `$geoip_disable: true` request anonymous processing without a person profile or GeoIP enrichment. See [PostHog anonymous API events](https://posthog.com/docs/data/anonymous-vs-identified-events). Ordinary HTTP metadata still reaches the receiving service; this design does not claim packet-level anonymity or zero network traffic.

Fetch omits credentials and referrers, rejects redirects, and avoids cache. Delivery is best effort: a 3-second abort deadline, at most four active requests, no queue, no retry, and silent failure. Requests beyond that cap are dropped. Blocking/rejecting analytics cannot prevent scanning, change an audit, or show a scan error. Lost events are possible; metrics are approximate.

## Exact event schema

No application object is spread into capture. Runtime construction and transport both enforce the event allowlist. No package-controlled strings are accepted as property values.

| Event | Product properties |
| --- | --- |
| `b08_real_scan_started` | `required_policy_used`: boolean; `artifact_provenance`: `own`, `third_party`, or `unknown` |
| `b08_real_scan_completed` | `outcome`: one of the four frozen outcomes; `missing_found`, `unknown_or_coverage_present`, `required_policy_used`, `supported_check_performed`, `html_present`, `html_scanned`, `local_html_reference_checked`: booleans; `artifact_provenance` enum |
| `b08_real_scan_failed` | `category`: `UNSUPPORTED_ARCHIVE`, `UNSAFE_OR_MALFORMED_ARCHIVE`, `RESOURCE_LIMIT`, `INVALID_POLICY`, `TIMEOUT`, or `UNEXPECTED`; `artifact_provenance` enum |
| `b08_evidence_opened` | `artifact_provenance` enum; `local_html_reference_checked`, `required_policy_used`: booleans |
| `b08_required_policy_reused` | `local_html_reference_checked`, `prior_local_html_reference_checked`: booleans; both scans must be self-reported own artifacts |
| `b08_later_release_confirmed` | None |
| `b08_paid_pack_interest` | `required_policy_used`: boolean; `artifact_provenance` enum |

The completed event derives flags from the audit summary: missing > 0; unknown > 0 or unscanned HTML > 0; checked assertions > 0. HTML relevance is separate: discovered HTML > 0, scanned HTML > 0, and at least one HTML finding FOUND/MISSING. Required assertions never set `local_html_reference_checked`. An optional ownership control defaults to `unknown` for every newly selected file; omission never implies ownership. Changing it clears any previous result. A “View evidence” link navigates to the existing report and emits once only after intentional activation, not when the report renders. Outcome values remain `ISSUES_FOUND`, `CHECKED_NO_ISSUES`, `CHECKED_WITH_UNKNOWNS`, and `NOT_AUDITABLE`. No exact counts are sent. Coverage-limited completion is a completed event, not a failed event. CANCELLED is intentionally omitted. Exception messages, stacks, filenames, sizes, package identifiers, HTML, references, paths, policy values, and digests are never transmitted.

## Exclusion

The synthetic example emits no experiment events and creates no cohort or policy history. Selecting a real file afterwards restores normal eligibility. `?internal=1` sets `b08.internal` to `1` and removes that parameter from the visible URL. While set, nothing is sent and experiment prompts are suppressed. `?internal=0` clears the flag and removes the parameter. Internal status is never sent. The app remains fully functional. Storage/crypto failures fail closed for measurement.

## Local storage inventory

Only these experiment keys are stored:

- `b08.internal`: the optional exclusion flag.
- `b08.experiment.v2`: random UUID v4 cohort prefixed `b08_`; `completedRelevantOwn` boolean; up to eight policy records containing a SHA-256 digest, random visit marker, and completion timestamp and a boolean recording HTML relevance.

Legacy v1 data is not read or promoted: it could not prove ownership or HTML relevance. Corrected cohorts begin with v2. Old v1 metadata may remain locally until site storage is cleared; it is never sent. The visit marker is generated per page/client lifetime. Metadata reading is capped at 4,096 characters and validated; malformed data is discarded. Policy history retains only the latest eight records. No package bytes, identifiers, filenames, HTML, paths, policy plaintext, or findings are persisted. Resetting/replacing the package leaves experiment metadata intact. Clearing site storage resets the cohort. Shared browsers and cleared storage mean cohorts are approximate, not people.

## Policy reuse

For completed self-reported own scans with at least one supported assertion and nonempty policy input, comparison hashes the UTF-8 JSON array of exactly the strings passed to the worker. Order, duplicates, and spaces are preserved for comparison; engine policy semantics are unchanged. Blank-line removal remains the existing UI contract. The digest stays local and is never an event property.

A reuse event requires the same digest in a different page/client visit and at least 30 minutes since its previous recorded completion. Same-visit retries never count; rapid reloads do not count. Completing a scan updates the record. Failed/invalid-policy, third-party and unspecified-ownership attempts do not record reuse. Reuse flags distinguish prior/current HTML checks from policy-only use; only events with both HTML flags true count as relevant own-package policy reuse. Measurement skips hashing inputs above 1,000 paths or 128 KiB encoded representation; scanning remains unaffected. This conservative rule may undercount reuse. Digest history is comparison metadata, not a package identifier or retention inference.

## Later release and interest

Only when BOTH the prior completion and current completion are self-reported own artifacts with scanned HTML and at least one FOUND/MISSING HTML reference can a subsequent scan ask: “Is this a later release candidate rather than a retry of the same fix?” Only explicit **Yes** emits a later-release event, once per attempt. **No / not sure**, first scans, demo scans, failed scans, and internal mode do not emit it. No package hashes, filename differences, or elapsed time infer later releases.

**A corrected rerun is NOT retention. Explicit later-release confirmation is the retention signal.** It remains self-reported and approximate.

A relevant own HTML scan with required policy can show **Local Release Pack — $19 one-time**, clearly **Not available yet**. The button expresses interest only. There is no checkout, preorder, email, account, or payment. One click per completed attempt emits only the policy-used boolean and provenance enum. **A paid-interest click is NOT willingness-to-pay proof.**

## Privacy and verification

Package analysis stays local. Coarse usage metrics may be sent. Public copy distinguishes these claims and explains the random browser identifier. No package URL is fetched or rendered by measurement.

Unit tests cover schema rejection, forbidden-value leakage, exclusions, random identity, digest locality and bounds, reuse rules, explicit intent, storage/network failure, and noncritical scan integration. `tests/browser/measurement-smoke.html` uses an isolated local-storage prefix, mocked capture transport, and actual native workers. It inspects serialized request bodies and tests demo, real scans, prompts, internal exclusion, local reuse, and blocked delivery. It does not prove live PostHog acceptance or packet-level guarantees. Before deployment, configure the intended project/HTTPS capture origin and verify receipt in that test project. No SDK configuration or automatic capture should be added.

## Experiment interpretation

Use completed events with `artifact_provenance=own` and all three HTML flags true for the relevant own-package denominator. Inspect evidence-opened events with own provenance and a checked HTML reference as intentional engagement. Later-release events remain explicit self-report, require prior/current relevant own HTML and are not inferred from policy reuse or file differences. Policy-only usage is measured separately. No pageviews/downloads prove usefulness; ownership and later releases are self-reported, cohorts approximate browsers, and best-effort events may be lost. Verify production project receipt separately after an approved deployment.
