# Browser worker integration — Day 2 Milestone 7

The frozen engine is unchanged. `src/worker/scan.worker.ts` is a dedicated module worker created with Vite's `new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' })` mechanism. The worker calls existing ingestion and package audit APIs. Archive payloads stay in the worker; only the audit or a structured error returns.

## Client and protocol

```ts
const client = new PackageScanClient();
const audit = await client.scan(fileOrArrayBuffer, requiredPaths);
client.cancel();
```

Reuse one client for v0's single active scan. `scan` returns `Promise<PackageAudit>`. Required paths default to an empty array. A new scan synchronously cancels the previous scan before creating a fresh worker. Every completion, error, cancellation, and timeout terminates that worker. There is no queue or persistent archive cache. Separate client instances are independent; the future application should own one instance.

The request is `SCAN` with numeric `requestId`, `input: ArrayBuffer | File`, and `requiredPaths`. Responses are `SCAN_STARTED`, `SCAN_RESULT` with the unchanged package audit, or `SCAN_ERROR` with structured error data. Each response carries the same request ID. The client ignores mismatched IDs and ignores queued responses after settlement. `SCAN_STARTED` is an internal acknowledgment, not detailed progress. Cancellation uses termination, so no `CANCEL` message is needed and synchronous parsing need not yield to process cancellation.

An ArrayBuffer is passed in the transfer list. A successful postMessage detaches it immediately from the caller, including all views sharing its backing buffer; the caller must not reuse it. Make an explicit copy before calling if retaining bytes is necessary. A File is structured-cloned without a transfer list, remains usable by the caller, and is streamed by ingestion in the worker. The wrapper does not read or buffer a File on the main thread. Required paths are cloned with the request and are validated by the existing engine.

## Failure and coverage semantics

`ScanError` exposes a typed `code`, message, and optional policy `entryIndex`. Archive errors preserve existing codes and messages, including limits, unsafe paths, unsupported formats/browser capabilities, and malformed gzip/TAR. Invalid required policy preserves `INVALID_POLICY` and the failing entry index. Unexpected engine failures return generic `INTERNAL_ERROR`; no original message or stack trace is serialized. Worker creation/runtime/message failures become `WORKER_FAILED`; a failed postMessage becomes `TRANSFER_FAILED`. Failed ingestion never returns a partial audit.

Cancellation rejects with `CANCELLED`. A fixed `SCAN_TIMEOUT_MS = 30000` starts before worker creation and covers startup, ingestion, audit, and response delivery. Timeout terminates the worker and rejects with `TIMEOUT`; it cannot produce a clean result. Browser timer scheduling and main-thread activity can delay timeout delivery. This is not a hard CPU deadline or memory guarantee. A transferred buffer is not recovered after cancellation or failure; File input can be retried directly.

All four package outcomes remain unchanged. Known HTML coverage limitations remain inside successful `SCAN_RESULT` audits, including CHECKED_WITH_UNKNOWNS and NOT_AUDITABLE. They are not worker failures. Existing missing-finding precedence is preserved.

## Structured cloning and privacy

Structured cloning removes engine Object.freeze flags. The client deliberately freezes all nested plain audit objects and arrays again with iterative traversal before resolving. Frozen metadata is restored, not preserved automatically across threads. No payload byte arrays occur in the audit. Results still contain diagnostic paths/literals and must eventually be displayed as escaped text. Main-thread result cloning and freezing have work proportional to the bounded audit output.

The integration contains no fetch, XHR, telemetry, remote reporting, package execution, or HTML rendering. Worker source/dependency loads are ordinary application asset requests; package bytes and required paths travel only via browser-local postMessage. Milestone 8 replaces the original developer-only smoke button with the input workflow described in [INPUT_WORKFLOW.md](INPUT_WORKFLOW.md). Embedded developer fixtures and diagnostics remain excluded from the production UI.

## Verification

`tests/worker-run.test.ts` executes real engine composition in Node, including gzip/TAR fixtures, all four outcomes, required policy, archive rejection, serialization, and coverage gaps. `tests/worker-client.test.ts` uses a transport double for lifecycle, IDs, ownership transfer-list selection, cancellation/replacement, timeout, failure cleanup, and refreezing. These unit tests do not claim browser Worker execution. `tests/worker-build.test.ts` builds the client entry in memory using production Vite and verifies separate worker output. The Milestone 8 production UI also calls the client and emits the worker asset.

The original `src/worker/dev-smoke.ts` function remains available as separate developer verification infrastructure, but is no longer imported by App. It uses actual module workers and embedded bytes from the deterministic missing-reference fixture, plus a generated bounded busy package. It checks worker acknowledgment, detached ArrayBuffer ownership, ISSUES_FOUND evidence, source locations, main-thread heartbeat while auditing, successful coverage gaps, cancellation after acknowledgment, File input, and recreation after cancellation/archive error. The current UI verification page is `/tests/browser/input-smoke.html`, served by Vite in development. Network resource timing reports application/worker module loads; no fixture is fetched or uploaded. This is local smoke evidence, not a complete packet capture or cross-browser certification.

Run `npm test`, `npm run typecheck`, and `npm run build`. The developer fixture source is `tests/browser/worker-smoke-fixtures.ts`; it contains gzip/TAR bytes only, never executable package code. No product UI, workers pool, telemetry, or new dependency is introduced.

Verified in actual Edge against the Vite dev app: six workers started and terminated; five ArrayBuffers transferred and detached; the File scan succeeded; the main-thread heartbeat advanced 170 times during the busy audit. All smoke assertions completed, including acknowledged cancellation and worker recreation after cancellation/error. Observed resource URLs were local application/worker modules only, with no package upload or external asset request. Browser logs contained no errors or warnings. This is an observed run, not a performance threshold. The full suite passed 370 tests; typecheck and production build passed. The separate production client-entry build also emitted the worker asset successfully.
