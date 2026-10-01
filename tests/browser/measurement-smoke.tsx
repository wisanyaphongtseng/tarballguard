import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import '../../src/style.css';
import { ExperimentMeasurement, EXPERIMENT_KEY, INTERNAL_KEY, REUSE_DELAY_MS } from '../../src/measurement/experiment';
import { promotionFixtures } from './promotion-smoke-fixtures';
import { missingReferenceBase64 } from './worker-smoke-fixtures';

const output = document.getElementById('verification-results')!;
const lines: string[] = [];
const log = (text: string) => { lines.push(text); output.textContent = lines.join('\n'); };
const check = (condition: boolean, label: string) => { if (!condition) throw new Error(label); log(label); };
const prefix = 'b08.test.measurement.';
const storage = { getItem: (key: string) => localStorage.getItem(prefix + key),
  setItem: (key: string, value: string) => localStorage.setItem(prefix + key, value),
  removeItem: (key: string) => localStorage.removeItem(prefix + key) };
storage.removeItem(EXPERIMENT_KEY); storage.removeItem(INTERNAL_KEY);
const payloads: { event: string; properties: Record<string, unknown>; distinct_id: string }[] = [];
let blocked = false;
let clock = Date.now();
let replacedUrl = '';
const mockFetch: typeof fetch = async (_url, options) => {
  if (blocked) throw new TypeError('Mock blocked endpoint');
  payloads.push(JSON.parse(String(options?.body)));
  return new Response('{}', { status: 200 });
};
const measurement = (internal = false) => new ExperimentMeasurement({ token: 'phc_test', host: 'https://posthog.example',
  development: false, hostname: 'experiment.example', url: `https://experiment.example/?internal=${internal ? '1' : '0'}`,
  replaceUrl: url => { replacedUrl = url; }, storage, crypto, fetch: mockFetch, now: () => clock });
let root = createRoot(document.getElementById('root')!);
function mount(internal = false) { root.render(<App measurement={measurement(internal)} />); }
function remount(internal = false) { root.unmount(); root = createRoot(document.getElementById('root')!); mount(internal); }
const button = (name: string) => [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!;
const status = () => document.querySelector('.scan-status')?.textContent ?? '';
async function waitFor(condition: () => boolean) {
  const start = performance.now();
  while (!condition()) { if (performance.now() - start > 35000) throw new Error('Browser wait timeout'); await new Promise(resolve => setTimeout(resolve, 10)); }
  await new Promise(resolve => setTimeout(resolve, 30));
}
async function scan({ base64 = missingReferenceBase64, required = 'secret-required/path', provenance = 'own', outcome = 'ISSUES_FOUND' } = {}) {
  const data = new DataTransfer();
  data.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'private-filename-1.2.3.tgz'));
  document.querySelector('.drop-zone')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  await waitFor(() => status().includes('Ready to scan'));
  const ownership = document.querySelector<HTMLSelectElement>('#artifact-provenance')!;
  check(ownership.value === 'unknown', 'Replacement resets optional ownership');
  ownership.value = provenance; ownership.dispatchEvent(new Event('change', { bubbles: true }));
  await waitFor(() => ownership.value === provenance);
  const textarea = document.querySelector('textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, required);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await waitFor(() => textarea.value === required);
  button('Scan package').click();
  await waitFor(() => status().includes('Scan complete'));
  check(status().includes(outcome), 'Actual worker audit completes: ' + outcome);
}
async function verify() {
  mount(); await waitFor(() => Boolean(button('Run sample scan')));
  button('Run sample scan').click(); await waitFor(() => status().includes('Scan complete'));
  check(payloads.length === 0 && storage.getItem(EXPERIMENT_KEY) === null, 'Demo sends no events and creates no cohort');
  await scan({ provenance: 'unknown' });
  check(!document.body.textContent!.includes('rather than a retry'), 'Unknown ownership does not qualify retention');
  await scan({ provenance: 'third_party' });
  await scan({ base64: promotionFixtures.policyOnly, required: 'README.md', outcome: 'CHECKED_NO_ISSUES' });
  check(payloads.at(-1)!.properties.local_html_reference_checked === false, 'Policy-only success does not count HTML relevance');
  await scan();
  check(payloads.some(p => p.event === 'b08_real_scan_started') && payloads.some(p => p.event === 'b08_real_scan_completed'), 'Real worker scan emits coarse start/completion');
  check(!document.body.textContent!.includes('rather than a retry'), 'First real scan has no later-release question');
  check(document.body.textContent!.includes('Not available yet.'), 'Interest card clearly unavailable');
  check(!payloads.some(p => p.event === 'b08_evidence_opened'), 'Rendering report emits no evidence engagement');
  document.querySelector<HTMLAnchorElement>('a[href="#report-heading"]')!.click();
  document.querySelector<HTMLAnchorElement>('a[href="#report-heading"]')!.click();
  await waitFor(() => payloads.some(p => p.event === 'b08_evidence_opened'));
  check(payloads.filter(p => p.event === 'b08_evidence_opened').length === 1, 'Evidence action emits once');
  for (const base64 of [promotionFixtures.baseFalseClean, promotionFixtures.encodedSpace, promotionFixtures.encodedName]) {
    await scan({ base64, required: '', outcome: 'NOT_AUDITABLE' });
    check(Boolean(document.querySelector('.audit-report')) && !document.body.textContent!.includes('rather than a retry'), 'Base/percent UNKNOWN report has no retention prompt');
  }
  await scan();
  button("I'm interested").click(); await waitFor(() => payloads.some(p => p.event === 'b08_paid_pack_interest'));
  await scan(); button('No / not sure').click();
  check(!payloads.some(p => p.event === 'b08_later_release_confirmed'), 'No/not sure emits no retention signal');
  await scan(); button('Yes').click(); await waitFor(() => payloads.some(p => p.event === 'b08_later_release_confirmed'));
  check(!payloads.some(p => p.event === 'b08_required_policy_reused'), 'Same-visit corrections do not count as policy reuse');
  clock += REUSE_DELAY_MS; remount(); await waitFor(() => Boolean(button('Run sample scan'))); await scan();
  await waitFor(() => payloads.some(p => p.event === 'b08_required_policy_reused'));
  check(true, 'Later visit plus 30 minutes detects policy reuse locally');
  const serialized = JSON.stringify(payloads);
  const local = JSON.parse(storage.getItem(EXPERIMENT_KEY)!) as { policies: { digest: string }[] };
  check(!['private-filename', '1.2.3', 'secret-required', 'index.html', 'style.css', 'app.js', '<script', './app.js', ...local.policies.map(p => p.digest)].some(secret => serialized.includes(secret)), 'Payload inspection: no filename/path/HTML/reference/policy/digest');
  check(payloads.every(p => p.properties.$process_person_profile === false && p.properties.$geoip_disable === true), 'Every event disables person profiles and GeoIP enrichment');
  const previous = payloads.length;
  remount(true); await waitFor(() => Boolean(button('Run sample scan'))); await scan();
  check(payloads.length === previous && !document.querySelector('.experiment-card') && replacedUrl === '/', 'Internal mode sends nothing, strips query, suppresses prompts');
  blocked = true; remount(); await waitFor(() => Boolean(button('Run sample scan'))); await scan();
  check(!document.querySelector('[role="alert"]') && payloads.length === previous, 'Blocked analytics leaves actual worker scan successful');
  check((performance.getEntriesByType('resource') as PerformanceResourceTiming[]).every(p => new URL(p.name).origin === location.origin), 'Observed resources are local app/worker assets; no SDK/replay or package-resource loads');
  log('CAPTURE PAYLOADS (mock transport, not live PostHog):\n' + JSON.stringify(payloads, null, 2));
  storage.removeItem(EXPERIMENT_KEY); storage.removeItem(INTERNAL_KEY);
  log('BROWSER MEASUREMENT SMOKE COMPLETE');
}
void verify().catch(error => log('BROWSER MEASUREMENT SMOKE FAILED: ' + error.message));
