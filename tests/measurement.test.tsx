import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { DirectCapture, captureConfig, DELIVERY_TIMEOUT_MS } from '../src/measurement/capture';
import { coarseErrorCategory, makeEvent } from '../src/measurement/events';
import { ExperimentMeasurement, EXPERIMENT_KEY, INTERNAL_KEY, MAX_POLICY_HISTORY, REUSE_DELAY_MS } from '../src/measurement/experiment';
import type { ExperimentEnvironment } from '../src/measurement/experiment';
import { ExperimentPrompts } from '../src/ui/ExperimentPrompts';
import { ScanWorkflow } from '../src/ui/scan-workflow';
import { auditPackage } from '../src/engine/package-audit';
import { ScanError } from '../src/worker/client';
import { LaunchNotes } from '../src/ui/Onboarding';

afterEach(() => vi.useRealTimers());
const checked = { outcome: 'CHECKED_NO_ISSUES', missing_found: false, unknown_or_coverage_present: false,
  required_policy_used: true, supported_check_performed: true, artifact_provenance: 'own',
  html_present: true, html_scanned: true, local_html_reference_checked: true } as const;
const emptyAudit = auditPackage({ files: [], entryCount: 0, decompressedBytes: 1024 });
const meaningfulAudit = { ...emptyAudit, outcome: 'ISSUES_FOUND' as const,
  summary: { ...emptyAudit.summary, missing: 1, found: 1, checkedAssertions: 2 } };
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };

test.each([
  ['ISSUES_FOUND', 1, 0, 0, 2],
  ['CHECKED_NO_ISSUES', 0, 0, 0, 1],
  ['CHECKED_WITH_UNKNOWNS', 0, 1, 0, 1],
  ['CHECKED_WITH_UNKNOWNS', 0, 0, 1, 1],
  ['NOT_AUDITABLE', 0, 0, 1, 0],
] as const)('workflow projects %s and coverage into coarse completion only', async (outcome, missing, unknown, htmlFilesNotScanned, checkedAssertions) => {
  const { measurement, payloads } = environment();
  const audit = { ...emptyAudit, outcome, summary: { ...emptyAudit.summary, missing, unknown, htmlFilesNotScanned, checkedAssertions } };
  const workflow = new ScanWorkflow({ scan: async () => audit, cancel: () => {} }, measurement);
  workflow.selectFiles([new File(['bytes'], 'private.tgz')]); await workflow.start();
  expect(workflow.getSnapshot().audit).toBe(audit);
  expect(payloads().at(-1)).toMatchObject({ event: 'b08_real_scan_completed', properties: {
    outcome, missing_found: missing > 0, unknown_or_coverage_present: unknown > 0 || htmlFilesNotScanned > 0,
    required_policy_used: false, supported_check_performed: checkedAssertions > 0,
  } });
});
test('public privacy distinguishes local package data from coarse anonymous usage', () => {
  const html = renderToStaticMarkup(<LaunchNotes />);
  expect(html).toContain('Package contents are not uploaded');
  expect(html).toContain('Coarse anonymous usage events may be sent to PostHog');
  expect(html).toContain('no filenames, paths, package contents, reference values, or required-file values');
  expect(html).toContain('random browser-local identifier');
});
function environment(overrides: Partial<ExperimentEnvironment> = {}) {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
  const env: ExperimentEnvironment = { token: 'phc_test_token', host: 'https://us.i.posthog.com', development: false,
    hostname: 'experiment.example', url: 'https://experiment.example/', replaceUrl: vi.fn(), storage, crypto,
    fetch: send, now: () => 10000000, ...overrides };
  const measurement = new ExperimentMeasurement(env);
  return { env, storage, values, send, measurement,
    payloads: () => send.mock.calls.map(([, options]) => JSON.parse(options!.body as string)) };
}

test.each([{ token: undefined }, { host: undefined }, { token: '', host: '' }])('missing config disables analytics and experiment storage: %o', config => {
  const { measurement, send, values } = environment(config);
  expect(measurement.start(['secret/path'], 'user', 'own')).toBeUndefined();
  expect(send).not.toHaveBeenCalled(); expect(values.size).toBe(0);
});
test.each(['localhost', 'sub.localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])('local host %s never sends even with config', hostname => {
  const { measurement, send } = environment({ hostname }); measurement.start([], 'user', 'own'); expect(send).not.toHaveBeenCalled();
});
test('development mode never sends on a nonlocal hostname', () => {
  const { measurement, send } = environment({ development: true }); measurement.start([], 'user', 'own'); expect(send).not.toHaveBeenCalled();
});
test('internal query persists local exclusion, removes only mode query, and sends no internal event', () => {
  const { measurement, storage, send, env } = environment({ url: 'https://experiment.example/?internal=1&keep=yes#section' });
  expect(storage.getItem(INTERNAL_KEY)).toBe('1');
  expect(env.replaceUrl).toHaveBeenCalledWith('/?keep=yes#section');
  expect(measurement.start([], 'user', 'own')).toBeUndefined();
  const later = new ExperimentMeasurement({ ...env, url: 'https://experiment.example/' });
  expect(later.start([], 'user', 'own')).toBeUndefined(); expect(send).not.toHaveBeenCalled();
});
test('persistent internal mode also stops already-created measurement instances', () => {
  const { measurement, storage, send } = environment(); storage.setItem(INTERNAL_KEY, '1');
  measurement.start([], 'user', 'own'); expect(send).not.toHaveBeenCalled();
});
test('internal=0 explicitly clears local exclusion', () => {
  const { env, storage, send } = environment(); storage.setItem(INTERNAL_KEY, '1');
  const measurement = new ExperimentMeasurement({ ...env, url: 'https://experiment.example/?internal=0' });
  measurement.start([], 'user', 'own'); expect(send).toHaveBeenCalledOnce(); expect(storage.getItem(INTERNAL_KEY)).toBeNull();
});
test('demo creates no cohort, policy history or events; own file afterward is real usage', () => {
  const { measurement, send, values } = environment();
  expect(measurement.start(['path'], 'example')).toBeUndefined();
  expect(values.size).toBe(0); expect(send).not.toHaveBeenCalled();
  measurement.start([], 'user', 'own'); expect(send).toHaveBeenCalledOnce();
});
test('real started/completed payload has exact allowlist plus fixed anonymous flags', () => {
  const { measurement, payloads, send } = environment();
  const attempt = measurement.start(['private/required'], 'user', 'own')!;
  measurement.complete(attempt, checked);
  const [started, completed] = payloads();
  expect(started).toEqual({ api_key: 'phc_test_token', event: 'b08_real_scan_started', distinct_id: expect.stringMatching(/^b08_/u),
    properties: { required_policy_used: true, artifact_provenance: 'own', $process_person_profile: false, $geoip_disable: true } });
  expect(completed.properties).toEqual({ ...checked, $process_person_profile: false, $geoip_disable: true });
  expect(send.mock.calls[0][0]).toBe('https://us.i.posthog.com/i/v0/e/');
  expect(send.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
});
test('event construction drops every forbidden extra rather than serializing caller objects', () => {
  const poison = { ...checked, filename: 'private.tgz', path: 'secret.html', reference: './secret.js',
    html: '<script>private</script>', requiredPaths: ['secret/required'], digest: 'private-digest', version: '1.2.3-private', hash: 'private-hash', errorText: 'private error text',
    packageBytes: new Uint8Array([99]), message: 'private error', stack: 'private stack', missing: 99 };
  const event = makeEvent('b08_real_scan_completed', poison)!;
  expect(event.properties).toEqual(checked);
  expect(JSON.stringify(event)).not.toMatch(/private|secret|filename|digest|stack|99/u);
  const sent = environment();
  new DirectCapture(captureConfig(sent.env.token, sent.env.host)!, sent.send).capture('b08_' + crypto.randomUUID(), event);
  expect(JSON.stringify(sent.payloads())).not.toMatch(/private|secret|filename|digest|stack/u);
});
test.each(['secret/path', '<img src=secret>', 'PASS', {}, 1])('package-controlled outcome %o cannot become an event property', value => {
  expect(makeEvent('b08_real_scan_completed', { ...checked, outcome: value })).toBeUndefined();
});
test('unknown names and nonboolean fields cannot pass the schema', () => {
  expect(makeEvent('private-event', {})).toBeUndefined();
  expect(makeEvent('b08_real_scan_started', { required_policy_used: 'secret/path' })).toBeUndefined();
  expect(makeEvent('b08_real_scan_failed', { category: 'secret error' })).toBeUndefined();
});
test('cohort uses random UUID, independent of policies, and survives another instance/reset', async () => {
  const { measurement, env, storage, payloads } = environment();
  const random = vi.spyOn(env.crypto, 'randomUUID');
  const workflow = new ScanWorkflow({ scan: async () => meaningfulAudit, cancel: () => {} }, measurement);
  workflow.selectFiles([new File(['bytes'], 'secret-package.tgz')]); await workflow.start(); workflow.removeFile();
  const saved = JSON.parse(storage.getItem(EXPERIMENT_KEY)!);
  expect(random).toHaveBeenCalled(); random.mockRestore();
  const next = new ExperimentMeasurement(env); next.start(['different/path'], 'user', 'own');
  expect(payloads().at(-1).distinct_id).toBe(saved.cohort);
  expect(JSON.stringify(payloads())).not.toContain('secret-package');
  const other = environment(); other.measurement.start([], 'user', 'own');
  expect(other.payloads()[0].distinct_id).not.toBe(saved.cohort);
});
test('policy SHA-256 is local, never transmitted; exact representation is preserved', async () => {
  const { measurement, storage, payloads } = environment();
  const paths = [' ./private/path ', './private/path'];
  const attempt = measurement.start(paths, 'user', 'own')!;
  measurement.complete(attempt, checked); await flush();
  const digest = await attempt.digest;
  const expected = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(paths)))).toString('hex');
  expect(digest).toBe(expected);
  expect(storage.getItem(EXPERIMENT_KEY)).toContain(expected);
  expect(storage.getItem(EXPERIMENT_KEY)).not.toContain('private/path');
  expect(JSON.stringify(payloads())).not.toContain(expected);
  expect(JSON.stringify(payloads())).not.toContain('private/path');
});
test('same-visit retry and fresh-visit correction under 30 minutes never count policy reuse', async () => {
  const { measurement, env, payloads } = environment();
  measurement.complete(measurement.start(['app.js'], 'user', 'own')!, checked); await flush();
  measurement.complete(measurement.start(['app.js'], 'user', 'own')!, checked); await flush();
  const next = new ExperimentMeasurement({ ...env, now: () => env.now() + REUSE_DELAY_MS - 1 });
  next.complete(next.start(['app.js'], 'user', 'own')!, checked); await flush();
  expect(payloads().filter(item => item.event === 'b08_required_policy_reused')).toHaveLength(0);
});
test('reuse requires different visit AND inclusive 30-minute boundary; digest never leaves browser', async () => {
  const { measurement, env, payloads, storage } = environment();
  measurement.complete(measurement.start(['app.js'], 'user', 'own')!, checked); await flush();
  const next = new ExperimentMeasurement({ ...env, now: () => env.now() + REUSE_DELAY_MS });
  next.complete(next.start(['app.js'], 'user', 'own')!, checked); await flush();
  next.complete(next.start(['app.js'], 'user', 'own')!, checked); await flush();
  const events = payloads().filter(item => item.event === 'b08_required_policy_reused');
  expect(events).toHaveLength(1); expect(events[0].properties).toEqual({ local_html_reference_checked: true, prior_local_html_reference_checked: true, $process_person_profile: false, $geoip_disable: true });
  expect(JSON.stringify(payloads())).not.toContain(JSON.parse(storage.getItem(EXPERIMENT_KEY)!).policies[0].digest);
});
test('different policies/order/spaces are not treated as identical', async () => {
  const { measurement, env, payloads } = environment();
  measurement.complete(measurement.start(['a', 'b'], 'user', 'own')!, checked); await flush();
  const next = new ExperimentMeasurement({ ...env, now: () => env.now() + REUSE_DELAY_MS });
  next.complete(next.start(['b', 'a'], 'user', 'own')!, checked); await flush();
  next.complete(next.start([' a', 'b'], 'user', 'own')!, checked); await flush();
  expect(payloads().filter(item => item.event === 'b08_required_policy_reused')).toHaveLength(0);
});
test('invalid/failed scans do not store policy reuse history or count previous completion', async () => {
  const { measurement, storage } = environment();
  const attempt = measurement.start(['../unsafe'], 'user', 'own')!; measurement.fail(attempt, 'INVALID_POLICY'); await flush();
  expect(JSON.parse(storage.getItem(EXPERIMENT_KEY)!)).toMatchObject({ completedRelevantOwn: false, policies: [] });
});
test('first scan cannot confirm later release; later scan needs explicit Yes, once', async () => {
  const { measurement, payloads } = environment();
  const first = measurement.start([], 'user', 'own')!; const firstPrompts = measurement.complete(first, checked)!;
  expect(firstPrompts.laterRelease).toBe(false); expect(measurement.answerLaterRelease(first, true)).toBe(false);
  await flush();
  const second = measurement.start([], 'user', 'own')!; expect(measurement.complete(second, checked)!.laterRelease).toBe(true);
  expect(payloads().filter(item => item.event === 'b08_later_release_confirmed')).toHaveLength(0);
  measurement.answerLaterRelease(second, false);
  expect(measurement.answerLaterRelease(second, true)).toBe(false);
  await flush();
  const third = measurement.start([], 'user', 'own')!; measurement.complete(third, checked);
  await flush();
  expect(measurement.answerLaterRelease(third, true)).toBe(true); measurement.answerLaterRelease(third, true);
  expect(payloads().filter(item => item.event === 'b08_later_release_confirmed')).toHaveLength(1);
});
test('failed later attempts cannot confirm release or paid interest', () => {
  const { measurement } = environment(); measurement.complete(measurement.start([], 'user', 'own')!, checked);
  const failed = measurement.start(['app.js'], 'user', 'own')!; measurement.fail(failed, 'TIMEOUT');
  expect(measurement.answerLaterRelease(failed, true)).toBe(false); expect(measurement.paidInterest(failed)).toBe(false);
});
test('paid probe requires meaningful real scan with policy and sends coarse boolean only once', async () => {
  const { measurement, payloads } = environment();
  const noPolicy = measurement.start([], 'user', 'own')!;
  expect(measurement.complete(noPolicy, checked)!.paidInterest).toBe(false);
  await flush();
  const noChecks = measurement.start(['a'], 'user', 'own')!;
  expect(measurement.complete(noChecks, { ...checked, supported_check_performed: false, local_html_reference_checked: false })!.paidInterest).toBe(false);
  await flush();
  const eligible = measurement.start(['private/path'], 'user', 'own')!;
  expect(measurement.complete(eligible, checked)!.paidInterest).toBe(true);
  await flush();
  measurement.paidInterest(eligible); measurement.paidInterest(eligible);
  const events = payloads().filter(item => item.event === 'b08_paid_pack_interest');
  expect(events).toHaveLength(1); expect(events[0].properties).toEqual({ required_policy_used: true, artifact_provenance: 'own', $process_person_profile: false, $geoip_disable: true });
});
test('interest card is explicitly unavailable and has no checkout/email/payment controls', () => {
  const html = renderToStaticMarkup(<ExperimentPrompts prompts={{ laterRelease: true, paidInterest: true, requiredPolicyUsed: true }}
    answerLaterRelease={() => {}} expressInterest={() => {}} />);
  expect(html).toContain('Local Release Pack — $19 one-time'); expect(html).toContain('Not available yet.');
  expect(html).toContain('not a purchase'); expect(html).toContain('No / not sure');
  expect(html).not.toMatch(/<input|<a|checkout|preorder|Stripe/iu);
});
test.each([() => { throw new Error('secret failure'); }, async () => { throw new Error('secret failure'); }])
  ('analytics synchronous/asynchronous network failure never changes scan', async fetchFailure => {
    const { env } = environment(); const measurement = new ExperimentMeasurement({ ...env, fetch: fetchFailure });
    const workflow = new ScanWorkflow({ scan: async () => meaningfulAudit, cancel: () => {} }, measurement);
    workflow.selectFiles([new File(['package'], 'private.tgz')]); await workflow.start();
    expect(workflow.getSnapshot().phase).toBe('completed'); expect(workflow.getSnapshot().audit).toBe(meaningfulAudit);
    expect(workflow.getSnapshot().message).toBeUndefined();
  });
test('even a throwing measurement hook cannot prevent scanning or corrupt its result', async () => {
  const { measurement } = environment(); vi.spyOn(measurement, 'start').mockImplementation(() => { throw new Error('oops'); });
  const workflow = new ScanWorkflow({ scan: async () => meaningfulAudit, cancel: () => {} }, measurement);
  workflow.selectFiles([new File([], 'private.tgz')]); await workflow.start();
  expect(workflow.getSnapshot().audit).toBe(meaningfulAudit);
});
test('workflow forwards only coarse completion and code, never filename/findings/errors', async () => {
  const { measurement, payloads } = environment();
  const client = { scan: vi.fn(async () => meaningfulAudit), cancel: () => {} };
  const workflow = new ScanWorkflow(client, measurement);
  workflow.selectFiles([new File(['private bytes'], 'private.tgz')]); workflow.setRequiredText('secret/required');
  await workflow.start(); workflow.expressPaidInterest();
  client.scan.mockRejectedValueOnce(new ScanError({ code: 'INVALID_TAR', message: 'secret/path <script>private html</script>' }));
  await workflow.start();
  expect(JSON.stringify(payloads())).not.toMatch(/private|secret|\.tgz|<script>|stack|finding/u);
  expect(payloads().at(-1).properties.category).toBe('UNSAFE_OR_MALFORMED_ARCHIVE');
});
test('local history is bounded to 8 digests, with no package plaintext/findings', async () => {
  const { measurement, values, storage } = environment();
  for (let i = 0; i < 12; i++) { measurement.complete(measurement.start([`secret/${i}`], 'user', 'own')!, checked); await flush(); }
  const raw = storage.getItem(EXPERIMENT_KEY)!; const stored = JSON.parse(raw);
  expect(stored.policies).toHaveLength(MAX_POLICY_HISTORY); expect(raw.length).toBeLessThan(4096);
  expect(raw).not.toContain('secret'); expect([...values.keys()]).toEqual([EXPERIMENT_KEY]);
  expect(Object.keys(stored)).toEqual(['cohort', 'completedRelevantOwn', 'policies']);
});
test('oversized policy comparison is skipped without changing engine input', async () => {
  const { measurement, storage } = environment();
  const attempt = measurement.start(['x'.repeat(131073)], 'user', 'own')!;
  measurement.complete(attempt, checked); expect(await attempt.digest).toBeUndefined();
  expect(JSON.parse(storage.getItem(EXPERIMENT_KEY)!).policies).toEqual([]);
});
test('blocked local storage disables measurement without scan failure', async () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
  const { measurement, send } = environment({ storage });
  const workflow = new ScanWorkflow({ scan: async () => meaningfulAudit, cancel: () => {} }, measurement);
  workflow.selectFiles([new File([], 'private.tgz')]); await workflow.start();
  expect(send).not.toHaveBeenCalled(); expect(workflow.getSnapshot().audit).toBe(meaningfulAudit);
});
test('failed write also prevents sending unpersisted identity', () => {
  const { measurement, env, send } = environment();
  vi.spyOn(env.storage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(measurement.start([], 'user', 'own')).toBeUndefined(); expect(send).not.toHaveBeenCalled();
});
test('bad stored metadata is discarded instead of leaking its contents', () => {
  const { env, storage, payloads } = environment(); storage.setItem(EXPERIMENT_KEY, JSON.stringify({ cohort: 'private/path', policies: ['private.tgz'] }));
  new ExperimentMeasurement(env).start([], 'user', 'own'); expect(JSON.stringify(payloads())).not.toContain('private');
});
test('delivery timeout aborts once, caps active requests, and never retries', async () => {
  vi.useFakeTimers();
  const send = vi.fn<typeof fetch>(() => new Promise(() => {}));
  const capture = new DirectCapture(captureConfig('phc_token', 'https://us.i.posthog.com')!, send);
  const event = makeEvent('b08_real_scan_started', { required_policy_used: false, artifact_provenance: 'unknown' })!;
  const cohort = 'b08_' + crypto.randomUUID();
  for (let i = 0; i < 10; i++) capture.capture(cohort, event);
  expect(send).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(DELIVERY_TIMEOUT_MS);
  expect(send.mock.calls.every(([, options]) => options!.signal!.aborted)).toBe(true);
  expect(send).toHaveBeenCalledTimes(4);
  capture.capture(cohort, event); expect(send).toHaveBeenCalledTimes(5);
  await vi.advanceTimersByTimeAsync(DELIVERY_TIMEOUT_MS);
});
test.each([['CANCELLED', undefined], ['UNSUPPORTED_TAR', 'UNSUPPORTED_ARCHIVE'], ['UNSAFE_PATH', 'UNSAFE_OR_MALFORMED_ARCHIVE'],
  ['LIMIT_EXCEEDED', 'RESOURCE_LIMIT'], ['INVALID_POLICY', 'INVALID_POLICY'], ['TIMEOUT', 'TIMEOUT'], ['READ_FAILED', 'UNEXPECTED']])
  ('error %s maps to coarse category without original data', (code, expected) => { expect(coarseErrorCategory(code)).toBe(expected); });
test.each(['http://us.i.posthog.com', 'https://user:password@host.test', 'https://host.test/path', 'https://host.test/?secret=x'])
  ('invalid capture host fails closed: %s', host => { expect(captureConfig('token', host)).toBeUndefined(); });


// Section H regressions: eligibility uses actual HTML evidence, never policy-only counts.
const asset = (path: string, text = '') => {
  const bytes = new TextEncoder().encode(text); return { path, bytes, size: bytes.length };
};
const relevantAudit = auditPackage({ files: [
  asset('dist/index.html', '<img src="logo.svg">'),
  asset('dist/logo.svg'),
], entryCount: 2, decompressedBytes: 2048 });

test.each([
  [emptyAudit, false, false, false],
  [auditPackage({ files: [asset('README.md')], entryCount: 1, decompressedBytes: 1024 }, ['README.md']), false, false, false],
  [auditPackage({ files: [asset('index.html', '<p>No inspectable references</p>')], entryCount: 1, decompressedBytes: 1024 }), true, true, false],
  [auditPackage({ files: [asset('index.html', '<base href="assets/"><img src="x.svg">')], entryCount: 1, decompressedBytes: 1024 }), true, true, false],
  [auditPackage({ files: [{ path: 'index.html', bytes: new Uint8Array([0xc0, 0x80]), size: 2 }], entryCount: 1, decompressedBytes: 1024 }), true, false, false],
  [relevantAudit, true, true, true],
] as const)('completion records HTML evidence independently of required assertions: %#', async (audit, present, scanned, checkedHtml) => {
  const { measurement, payloads } = environment();
  const workflow = new ScanWorkflow({ scan: async () => audit, cancel: () => {} }, measurement);
  workflow.selectFiles([new File([], 'private-1.2.3.tgz')]);
  workflow.setProvenance('own');
  await workflow.start();
  expect(payloads().at(-1).properties).toMatchObject({ artifact_provenance: 'own',
    html_present: present, html_scanned: scanned, local_html_reference_checked: checkedHtml });
  expect(workflow.getSnapshot().audit).toBe(audit);
});

test('ownership is optional, allowlisted, per selected file and cannot change a running attempt', async () => {
  const { measurement, payloads } = environment();
  let finish!: (audit: typeof emptyAudit) => void;
  const workflow = new ScanWorkflow({ scan: () => new Promise(resolve => { finish = resolve; }), cancel: () => {} }, measurement);
  workflow.selectFiles([new File([], 'own.tgz')]);
  expect(workflow.getSnapshot().artifactProvenance).toBe('unknown');
  workflow.setProvenance('own');
  const scan = workflow.start(); workflow.setProvenance('third_party'); finish(relevantAudit); await scan;
  expect(payloads().at(-1).properties.artifact_provenance).toBe('own');
  workflow.selectFiles([new File([], 'other.tgz')]);
  expect(workflow.getSnapshot().artifactProvenance).toBe('unknown');
  workflow.setProvenance('private/path' as 'own');
  expect(workflow.getSnapshot().artifactProvenance).toBe('unknown');
  workflow.setProvenance('third_party'); workflow.removeFile();
  expect(workflow.getSnapshot().artifactProvenance).toBe('unknown');
});

test('default unknown and third-party scans cannot establish own-package retention', () => {
  for (const provenance of ['unknown', 'third_party'] as const) {
    const { measurement } = environment();
    measurement.complete(measurement.start([], 'user', provenance)!, checked);
    const own = measurement.start([], 'user', 'own')!;
    expect(measurement.complete(own, checked)!.laterRelease).toBe(false);
    expect(measurement.answerLaterRelease(own, true)).toBe(false);
  }
  const { measurement, payloads } = environment(); measurement.start([], 'user');
  expect(payloads()[0].properties.artifact_provenance).toBe('unknown');
});

test('later-release confirmation requires prior AND current relevant own HTML checks', async () => {
  const { measurement, payloads } = environment();
  const policyOnly = { ...checked, html_present: false, html_scanned: false, local_html_reference_checked: false };
  measurement.complete(measurement.start(['README.md'], 'user', 'own')!, policyOnly); await flush();
  const firstRelevant = measurement.start([], 'user', 'own')!;
  expect(measurement.complete(firstRelevant, checked)!.laterRelease).toBe(false); await flush();
  for (const [provenance, completion] of [['own', policyOnly], ['third_party', checked], ['unknown', checked]] as const) {
    const attempt = measurement.start([], 'user', provenance)!;
    expect(measurement.complete(attempt, completion)!.laterRelease).toBe(false);
    expect(measurement.answerLaterRelease(attempt, true)).toBe(false); await flush();
  }
  const eligible = measurement.start([], 'user', 'own')!;
  expect(measurement.complete(eligible, checked)!.laterRelease).toBe(true);
  expect(measurement.answerLaterRelease(eligible, true)).toBe(true);
  expect(measurement.answerLaterRelease(eligible, true)).toBe(false);
  expect(payloads().filter(p => p.event === 'b08_later_release_confirmed')).toHaveLength(1);
});

test('legacy metadata cannot count an irrelevant or unknown-origin scan as prior own HTML', () => {
  const { env, storage } = environment();
  storage.setItem('b08.experiment.v1', JSON.stringify({ cohort: 'b08_' + crypto.randomUUID(), completedReal: true,
    policies: [{ digest: 'a'.repeat(64), visit: crypto.randomUUID(), completedAt: 1 }] }));
  const measurement = new ExperimentMeasurement(env);
  expect(measurement.complete(measurement.start([], 'user', 'own')!, checked)!.laterRelease).toBe(false);
});

test('evidence engagement requires an explicit action, once per completed attempt, and resets on replacement', async () => {
  const { measurement, payloads } = environment();
  const workflow = new ScanWorkflow({ scan: async () => relevantAudit, cancel: () => {} }, measurement);
  workflow.openEvidence();
  workflow.selectFiles([new File([], 'private.tgz')]); workflow.setProvenance('own'); await workflow.start();
  expect(payloads().filter(p => p.event === 'b08_evidence_opened')).toHaveLength(0);
  workflow.openEvidence(); workflow.openEvidence();
  expect(payloads().filter(p => p.event === 'b08_evidence_opened')).toHaveLength(1);
  await flush();
  workflow.selectFiles([new File([], 'private-other.tgz')]); workflow.openEvidence(); await workflow.start(); workflow.openEvidence();
  expect(payloads().filter(p => p.event === 'b08_evidence_opened')).toHaveLength(2);
  expect(payloads().at(-1).properties).toMatchObject({ artifact_provenance: 'unknown', local_html_reference_checked: true });
});

test('own policy-only reuse is distinguished from HTML reuse; third-party policies never seed it', async () => {
  const { measurement, env, payloads } = environment();
  const policyOnly = { ...checked, html_present: false, html_scanned: false, local_html_reference_checked: false };
  measurement.complete(measurement.start(['secret'], 'user', 'third_party')!, checked); await flush();
  const second = new ExperimentMeasurement({ ...env, now: () => env.now() + REUSE_DELAY_MS });
  second.complete(second.start(['secret'], 'user', 'own')!, policyOnly); await flush();
  expect(payloads().filter(p => p.event === 'b08_required_policy_reused')).toHaveLength(0);
  const third = new ExperimentMeasurement({ ...env, now: () => env.now() + 2 * REUSE_DELAY_MS });
  third.complete(third.start(['secret'], 'user', 'own')!, checked); await flush();
  expect(payloads().find(p => p.event === 'b08_required_policy_reused').properties).toMatchObject({
    local_html_reference_checked: true, prior_local_html_reference_checked: false,
  });
});

test.each(['b08_real_scan_started', 'b08_real_scan_completed', 'b08_real_scan_failed', 'b08_evidence_opened'] as const)(
  'new event properties never accept package-controlled strings: %s', name => {
    expect(makeEvent(name, { ...checked, category: 'TIMEOUT', artifact_provenance: 'private.tgz' })).toBeUndefined();
    if (name === 'b08_real_scan_completed') {
      expect(makeEvent(name, { ...checked, html_present: 'private.html' })).toBeUndefined();
      expect(makeEvent(name, { ...checked, html_scanned: 'private.html' })).toBeUndefined();
      expect(makeEvent(name, { ...checked, local_html_reference_checked: 'private.html' })).toBeUndefined();
    }
  });
