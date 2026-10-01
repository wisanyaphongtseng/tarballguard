# Public onboarding — Day 3 Milestone 10

This milestone changes public copy, onboarding, and practical presentation only. Engine and worker behavior are unchanged. No analytics, deployment, backend, new scanner, archive support, or export is introduced.

## Visitor flow

The page uses the product name "npm Packed Web-Asset Preflight" and headline "Check what you're actually publishing to npm." It explains literal script/src, link/href, and img/src references in packed HTML, plus optional required files. Visible secondary sections explain unsupported checks, local processing, archive/HTML limitations, and how to create an artifact with `npm pack`. `npm pack --dry-run` is explicitly a preview, not an archive-producing step. The site never executes these commands.

The privacy claim concerns package contents: B08 processes them locally, does not upload them, does not execute package code, and does not run install scripts. It does not claim that application asset loading creates zero network traffic. Static checks do not replace integration/smoke tests or guarantee runtime behavior.

Unsupported archive messages describe a B08 support limitation, not a broken package. They state that no clean result was produced and point to visible current limitations. Existing typed worker errors and audit outcomes are unchanged.

## Synthetic example and identity

`createExamplePackage()` in `src/ui/example-package.ts` reconstructs a 192-byte deterministic gzip/USTAR fixture embedded in the application. It contains only `index.html` and `style.css`; the HTML references `./style.css` and absent `./app.js`. It contains no third-party package code. A byte-identity test ties it to the existing missing-reference fixture and its regeneration tests. There is no browser TAR generator, result stub, fetched package, or alternative scanner.

`ScanWorkflow.tryExample()` starts with an empty required-file list, selects this File, and calls the existing `start()` method. That sends the File through PackageScanClient, the actual worker, archive ingestion, and package audit. The example button is disabled during active scans, with a matching controller guard. The selected-file and completed-result areas identify the synthetic demo.

The shallow-frozen UI snapshot now contains `inputKind: 'example' | 'user' | null`. This identity is independent of filename: a real file called `b08-example.tgz` is still user input. Example identity survives policy edits, rescan, cancellation, and completion. Real picker/drop selections replace it with `user`; removal/reset returns `null`. No identity is sent to telemetry or used to alter engine checks.

After completion, **Scan another package** appears near the status, clears the selected file/report, and returns keyboard focus to the drop/picker button. Required text remains available under the existing reset contract. The original replace/remove workflow stays available.

## Source configuration and metadata

No repository URL exists in current package metadata or Git remotes. `VITE_SOURCE_REPOSITORY_URL` accepts a deployment-owned public HTTPS URL. Blank, malformed, non-HTTPS, or credential-bearing URLs render a truthful pending-source message, never an invented link. A configured URL renders "Source available for inspection." Package-controlled text never supplies this link. `.env.example` documents the option; local `.env` files are ignored. Vite settings are public build data, not secrets.

`index.html` has the product title, description, viewport, and basic Open Graph title/description/type. No public deployment URL is invented. There is no existing favicon asset, so no logo, remote image, tracking pixel, or favicon was added. README now explains the problem, example, scope/outcomes, privacy, limitations, architecture, test infrastructure, source setting, and local development commands.

## Accessibility and verification

New content uses semantic sections, associated headings, native buttons/links, readable text, visible focus states, and narrow-screen layouts. Example and reset controls are keyboard accessible. Existing polite lifecycle announcements and text-only report evidence remain intact. Public copy contains no internal milestone terms or developer controls; development-only smoke pages remain available.

Unit tests cover landing copy, privacy, limitations, npm pack/dry-run guidance, sample byte identity and real engine composition through the worker handler, demo lifecycle, source URL validation, safe unsupported-format wording, and static metadata. Node handler tests do not claim actual browser Worker execution.

`tests/browser/launch-smoke.html` mounts the real app and uses native Workers. Its test-only Worker subclass observes SCAN/SCAN_RESULT transport metadata while calling the native implementation unchanged; it does not fake responses or computation. It verifies sample evidence, demo identity, reset/focus, and a supplied real fixture. Existing report/input smoke pages continue to verify all four outcomes, required files, uncertainty/coverage, cancellation, hostile text, and local resource timing. These pages are not production entries.

Before launch, configure the actual source repository URL and choose deployment separately. Analytics and deployment remain deferred. Browser resource timing is smoke evidence, not a full network packet capture or a hard processing guarantee.

Verified in Edge against Vite: the public landing page, keyboard Tab/Enter sample activation, solid focus outlines, textarea/control order, keyboard reset back to the picker, and mobile sample completion. At a 390 × 844 viewport override, the actual public page measured 375 CSS pixels for both client width and scroll width before and after scanning; the override was reset. The launch smoke observed a real File request and SCAN_RESULT from a native worker, expected missing/found findings, identifiable demo state, reset, and replacement with user input. Existing input/report smoke pages passed required-file checks, all four outcomes, coverage gaps, cancellation/retry, malicious text, and local resource observations. Captured console logs contained no warnings or errors.

`npm test` passed 433 tests, including 15 new onboarding/sample tests. `npm run typecheck`, `npm run build`, and `git diff --check` passed. The engine/worker diff is empty; the production worker asset remains unchanged. No dependency was added.
