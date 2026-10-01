# B08 30-day experiment measurement

Milestone 11 adds narrow optional measurement without changing the frozen engine or worker. No deployment is performed. The experiment asks whether people scan real artifacts, perform supported checks, reuse policies, return for later release candidates, and express interest in a possible local release workflow.

## Integration and configuration

The browser sends explicit custom JSON events directly to PostHog's `/i/v0/e/` endpoint. There is no analytics SDK or automatic page, click, form, error, replay, heatmap, survey, or feature-flag capture. No identify, alias, or login calls exist. Configuration uses public Vite variables `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`. The host must be an HTTPS origin without credentials, path, query, or fragment. Missing/invalid configuration disables measurement. Development and localhost are always excluded, including preview on localhost.

Each request contains only `api_key`, `event`, `distinct_id`, and the allowlisted `properties`. The distinct ID is a random browser cohort. Fixed properties `$process_person_profile: false` and `$geoip_disable: true` request anonymous processing without a person profile or GeoIP enrichment. See [PostHog anonymous API events](https://posthog.com/docs/data/anonymous-vs-identified-events). Ordinary HTTP metadata still reaches the receiving service; this design does not claim packet-level anonymity or zero network traffic.

Fetch omits credentials and referrers, rejects redirects, and avoids cache. Delivery is best effort: a 3-second abort deadline, at most four active requests, no queue, no retry, and silent failure. Requests beyond that cap are dropped. Blocking/rejecting analytics cannot prevent scanning, change an audit, or show a scan error. Lost events are possible; metrics are approximate.

## Exact event schema

No application object is spread into capture. Runtime construction and transport both enforce the event allowlist. No package-controlled strings are accepted as property values.

| Event | Product properties |
| --- | --- |
| `b08_real_scan_started` | `required_policy_used`: boolean |
| `b08_real_scan_completed` | `outcome`: one of the four frozen outcomes; `missing_found`, `unknown_or_coverage_present`, `required_policy_used`, `supported_check_performed`: booleans |
| `b08_real_scan_failed` | `category`: `UNSUPPORTED_ARCHIVE`, `UNSAFE_OR_MALFORMED_ARCHIVE`, `RESOURCE_LIMIT`, `INVALID_POLICY`, `TIMEOUT`, or `UNEXPECTED` |
| `b08_required_policy_reused` | None |
| `b08_later_release_confirmed` | None |
| `b08_paid_pack_interest` | `required_policy_used`: boolean |

The completed event derives flags from the audit summary: missing > 0; unknown > 0 or unscanned HTML > 0; checked assertions > 0. Outcome values remain `ISSUES_FOUND`, `CHECKED_NO_ISSUES`, `CHECKED_WITH_UNKNOWNS`, and `NOT_AUDITABLE`. No exact counts are sent. Coverage-limited completion is a completed event, not a failed event. CANCELLED is intentionally omitted. Exception messages, stacks, filenames, sizes, package identifiers, HTML, references, paths, policy values, and digests are never transmitted.

## Exclusion

The synthetic example emits no experiment events and creates no cohort or policy history. Selecting a real file afterwards restores normal eligibility. `?internal=1` sets `b08.internal` to `1` and removes that parameter from the visible URL. While set, nothing is sent and experiment prompts are suppressed. `?internal=0` clears the flag and removes the parameter. Internal status is never sent. The app remains fully functional. Storage/crypto failures fail closed for measurement.

## Local storage inventory

Only these experiment keys are stored:

- `b08.internal`: the optional exclusion flag.
- `b08.experiment.v1`: random UUID v4 cohort prefixed `b08_`; `completedReal` boolean; up to eight policy records containing a SHA-256 digest, random visit marker, and completion timestamp.

The visit marker is generated per page/client lifetime. Metadata reading is capped at 4,096 characters and validated; malformed data is discarded. Policy history retains only the latest eight records. No package bytes, identifiers, filenames, HTML, paths, policy plaintext, or findings are persisted. Resetting/replacing the package leaves experiment metadata intact. Clearing site storage resets the cohort. Shared browsers and cleared storage mean cohorts are approximate, not people.

## Policy reuse

For successful real scans with nonempty policy input, comparison hashes the UTF-8 JSON array of exactly the strings passed to the worker. Order, duplicates, and spaces are preserved for comparison; engine policy semantics are unchanged. Blank-line removal remains the existing UI contract. The digest stays local and is never an event property.

A reuse event requires the same digest in a different page/client visit and at least 30 minutes since its previous recorded completion. Same-visit retries never count; rapid reloads do not count. Completing a scan updates the record. Failed/invalid-policy attempts do not record reuse. Measurement skips hashing inputs above 1,000 paths or 128 KiB encoded representation; scanning remains unaffected. This conservative rule may undercount reuse. Digest history is comparison metadata, not a package identifier or retention inference.

## Later release and interest

After a prior completed real scan, a subsequent completed real scan can ask: “Is this a later release candidate rather than a retry of the same fix?” Only explicit **Yes** emits a later-release event, once per attempt. **No / not sure**, first scans, demo scans, failed scans, and internal mode do not emit it. No package hashes, filename differences, or elapsed time infer later releases.

**A corrected rerun is NOT retention. Explicit later-release confirmation is the retention signal.** It remains self-reported and approximate.

A meaningful real scan with required policy can show **Local Release Pack — $19 one-time**, clearly **Not available yet**. The button expresses interest only. There is no checkout, preorder, email, account, or payment. One click per completed attempt emits only a policy-used boolean. **A paid-interest click is NOT willingness-to-pay proof.**

## Privacy and verification

Package analysis stays local. Coarse usage metrics may be sent. Public copy distinguishes these claims and explains the random browser identifier. No package URL is fetched or rendered by measurement.

Unit tests cover schema rejection, forbidden-value leakage, exclusions, random identity, digest locality and bounds, reuse rules, explicit intent, storage/network failure, and noncritical scan integration. `tests/browser/measurement-smoke.html` uses an isolated local-storage prefix, mocked capture transport, and actual native workers. It inspects serialized request bodies and tests demo, real scans, prompts, internal exclusion, local reuse, and blocked delivery. It does not prove live PostHog acceptance or packet-level guarantees. Before deployment, configure the intended project/HTTPS capture origin and verify receipt in that test project. No SDK configuration or automatic capture should be added.
