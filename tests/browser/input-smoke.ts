import '../../src/main';
import { busyPackageBase64, missingReferenceBase64 } from './worker-smoke-fixtures';

// Real React UI + real browser Worker. Fixture events simulate a dropped File and
// picker change, not an OS drag gesture or native file-dialog selection.
const output = document.getElementById('verification-results')!;
const lines: string[] = [];
const log = (text: string) => { lines.push(text); output.textContent = lines.join('\n'); };
const button = (label: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === label);
const status = () => document.querySelector('.scan-status')?.textContent ?? '';
async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 35000) throw new Error(label);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
function check(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
  log(label);
}
const fixture = (base64: string, name: string) => new File([
  Uint8Array.from(atob(base64), char => char.charCodeAt(0)),
], name);
function supply(file: File, method: 'drop' | 'change'): void {
  const data = new DataTransfer(); data.items.add(file);
  if (method === 'drop') {
    document.querySelector('.drop-zone')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  } else {
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
function policy(value: string): void {
  const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function verify() {
  await waitFor(() => Boolean(button('Scan package')), 'App did not mount');
  check(button('Scan package')!.disabled, 'No file: Scan disabled');
  check(document.body.textContent!.includes('Your package stays in this browser.'), 'Privacy copy present');
  supply(fixture(missingReferenceBase64, 'missing-reference.tgz'), 'drop');
  await waitFor(() => status().includes('Ready to scan'), 'Drop failed');
  check(document.querySelector('.filename')?.textContent === 'missing-reference.tgz', 'Dropped .tgz filename displayed');
  check(Boolean(document.querySelector('.file-size')?.textContent), 'Human-readable file size displayed');
  button('Scan package')!.click();
  await waitFor(() => status().includes('Scan complete'), 'Worker scan did not complete');
  check(status().includes('ISSUES_FOUND'), 'Real missing-reference worker scan: ISSUES_FOUND');
  check(!document.querySelector('script[src="./app.js"]'), 'Package HTML never injected');

  policy('../unsafe');
  await waitFor(() => status().includes('Ready to scan'), 'Policy edit failed');
  check(!status().includes('ISSUES_FOUND'), 'Policy edit clears stale result');
  button('Scan package')!.click();
  await waitFor(() => status().includes('required-file path is invalid'), 'Invalid policy not surfaced');
  log('INVALID_POLICY safe error displayed');

  policy('style.css\n\nstyle.css');
  await waitFor(() => status().includes('Ready to scan'), 'Policy edit failed');
  supply(new File(['not gzip'], 'malformed.tgz'), 'change');
  await waitFor(() => document.querySelector('.filename')?.textContent === 'malformed.tgz', 'Picker change failed');
  check(status().includes('Ready to scan') && !status().includes('required-file path is invalid'), 'Picker change handler resets stale error');
  button('Scan package')!.click();
  await waitFor(() => status().includes('malformed'), 'Malformed archive not surfaced');
  log('Malformed archive safe error displayed');

  policy('');
  supply(fixture(busyPackageBase64, 'busy.tgz'), 'drop');
  await waitFor(() => status().includes('Ready to scan'), 'Busy package selection failed');
  button('Scan package')!.click();
  await waitFor(() => Boolean(button('Cancel scan')), 'Cancel button missing');
  check(button('Scanning…')!.disabled, 'Scan disabled while active');
  button('Cancel scan')!.click();
  await waitFor(() => status().includes('Scan cancelled'), 'Cancellation failed');
  check(!button('Scan package')!.disabled, 'Cancellation allows retry');
  log('Real worker cancelled through UI');

  let heartbeat = 0;
  const interval = setInterval(() => heartbeat++, 5);
  button('Scan package')!.click();
  await waitFor(() => status().includes('Scan complete'), 'Retry failed');
  clearInterval(interval);
  check(heartbeat > 0, `Main-thread heartbeat during worker scan: ${heartbeat}`);
  check(status().includes('CHECKED_WITH_UNKNOWNS'), 'Coverage gaps remain completed audit');
  button('Remove file')!.click();
  await waitFor(() => status().includes('Choose a package'), 'Removal failed');
  check(button('Scan package')!.disabled && !document.querySelector('.filename'), 'Removal returns idle');
  check(document.querySelector('[role=status][aria-live=polite]') !== null, 'Accessible live status present');
  const requests = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const unique = [...new Set(requests.map(item => item.name))];
  check(unique.every(url => new URL(url).origin === location.origin), 'Observed requests stay on local Vite origin');
  log('Observed resource requests: ' + unique.join('\n'));
  log('BROWSER INPUT SMOKE COMPLETE');
}
void verify().catch(error => log('BROWSER INPUT SMOKE FAILED: ' + error.message));
