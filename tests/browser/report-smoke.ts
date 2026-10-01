import '../../src/main';
import { missingReferenceBase64 } from './worker-smoke-fixtures';
import { reportFixtures } from './report-smoke-fixtures';

// Real React and actual module workers; browser File events, not OS drag gestures.
const output = document.getElementById('verification-results')!;
const lines: string[] = [];
const log = (text: string) => { lines.push(text); output.textContent = lines.join('\n'); };
const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!;
const report = () => document.querySelector('.audit-report');
const content = () => report()?.textContent ?? '';
const check = (condition: boolean, label: string) => { if (!condition) throw new Error(label); log(label); };
async function waitFor(condition: () => boolean, label: string) {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 35000) throw new Error(label);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
function policy(value: string) {
  const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function scan(base64: string, name: string, required = '') {
  const data = new DataTransfer();
  data.items.add(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], name + '.tgz'));
  document.querySelector('.drop-zone')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  await waitFor(() => document.querySelector('.filename')?.textContent === name + '.tgz', 'Selection failed');
  check(!report(), name + ': previous report cleared on selection');
  policy(required);
  await waitFor(() => !button('Scan package').disabled, 'Not ready');
  button('Scan package').click();
  await waitFor(() => Boolean(report()), name + ': worker report not completed');
}
async function verify() {
  await waitFor(() => Boolean(button('Scan package')), 'App mount');
  await scan(missingReferenceBase64, 'missing-reference');
  check(content().includes('ISSUES_FOUND') && content().includes('Expected packed file') && content().includes('app.js'), 'Missing reference and expected path displayed');
  check(content().includes('FOUND — Present in package') && content().includes('style.css'), 'Found style.css displayed');
  check(/index\.html:\d+:\d+/u.test(content()), 'Missing reference source line and column displayed');
  await scan(reportFixtures.clean, 'required', 'app.js\ndist/index.html');
  check(content().includes('ISSUES_FOUND') && content().includes('dist/index.html') && content().includes('MISSING — Missing from packed package') && content().includes('FOUND — Present'), 'Required findings distinguish missing and found');
  policy('');
  await waitFor(() => !report(), 'Policy edit did not reset report');
  button('Scan package').click();
  await waitFor(() => Boolean(report()), 'Rescan did not complete');
  check(content().includes('CHECKED_NO_ISSUES') && !content().includes('dist/index.html'), 'Rescan replaces previous findings');
  check(content().includes('No issues found in the checks that were performed.') && !/safe to publish|\bPASS\b/iu.test(content()), 'Clean wording remains conservative');
  check(content().includes('does not guarantee that the package works at runtime'), 'Static-check limitation shown');
  const skipped = document.querySelector<HTMLDetailsElement>('.skipped-section')!;
  skipped.open = true;
  check(skipped.textContent!.includes('External/non-package references are intentionally not checked'), 'Skipped section has explicit scope');
  check(!report()!.querySelector('a, img, iframe, script, [src], [href]'), 'External references render as inert text');
  await scan(reportFixtures.unknown, 'unknown');
  check(content().includes('CHECKED_WITH_UNKNOWNS') && content().includes('Could not determine') && content().includes('/assets/runtime.js'), 'Unknown coverage visible');
  await scan(reportFixtures.notAuditable, 'not-auditable');
  check(content().includes('NOT_AUDITABLE') && content().includes('Add expected package files above and scan again.'), 'Not auditable has actionable explanation');
  check(!content().includes('Verified packed references'), 'Empty findings sections absent');
  await scan(reportFixtures.coverage, 'coverage');
  check(content().includes('CHECKED_WITH_UNKNOWNS') && content().includes('Coverage limitations') && content().includes('bad.html') && content().includes('HTML_COMPLEXITY_LIMIT'), 'Rejected HTML remains explicit coverage gap');
  await scan(reportFixtures.manyFound, 'many-found');
  check(content().includes('Showing 50 of 51'), 'Bounded report states displayed row count');
  button('Show next 1 verified references').click();
  await waitFor(() => content().includes('Showing 51 of 51'), 'Reveal failed');
  check(report()!.querySelectorAll('.report-list > li').length === 51, 'Reveal control exposes remaining findings');
  await scan(reportFixtures.malicious, 'malicious');
  document.querySelector<HTMLDetailsElement>('.skipped-section')!.open = true;
  check(content().includes('<iframe src=https://example.invalid/evil>') && content().includes('<img src=x>.html'), 'Malicious markup and filename shown as text');
  check(content().includes('javascript:alert(1)') && content().includes('data:text/html,evil'), 'Dangerous URL schemes shown as text');
  check(!report()!.querySelector('a, img, iframe, script, [src], [href]'), 'Package text creates no links or resource elements');
  check(document.documentElement.scrollWidth <= document.documentElement.clientWidth, 'Long references do not overflow current viewport');
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  check(resources.every(item => new URL(item.name).origin === location.origin), 'Observed resource requests stay local; no displayed package reference loaded');
  log('Observed resources: ' + [...new Set(resources.map(item => item.name))].join('\n'));
  log('BROWSER REPORT SMOKE COMPLETE');
}
void verify().catch(error => log('BROWSER REPORT SMOKE FAILED: ' + error.message));
