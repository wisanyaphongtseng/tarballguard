import '../../src/main';
import { missingReferenceBase64 } from './worker-smoke-fixtures';

const output = document.getElementById('verification-results')!;
const lines: string[] = [];
const log = (text: string) => { lines.push(text); output.textContent = lines.join('\n'); };
const check = (condition: boolean, label: string) => { if (!condition) throw new Error(label); log(label); };
const button = (name: string) => [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!;
const status = () => document.querySelector('.scan-status')?.textContent ?? '';
async function waitFor(condition: () => boolean, label: string) {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 35000) throw new Error(label);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// Observe transport, never substitute computation: these remain native browser Workers.
const NativeWorker = window.Worker;
let scans = 0;
let results = 0;
let exampleFileSent = false;
class ObservedWorker extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options);
    this.addEventListener('message', event => { if (event.data.type === 'SCAN_RESULT') results++; });
  }
  override postMessage(message: unknown, options: Transferable[] | StructuredSerializeOptions = []) {
    const request = message as { type?: string; input?: File };
    if (request.type === 'SCAN') {
      scans++;
      exampleFileSent ||= request.input instanceof File && request.input.name === 'b08-example.tgz';
    }
    if (Array.isArray(options)) super.postMessage(message, options);
    else super.postMessage(message, options);
  }
}
window.Worker = ObservedWorker;

async function verify() {
  await waitFor(() => Boolean(button('Run sample scan')), 'App mount');
  check(document.querySelector('.product-name')?.textContent === 'TarballGuard' &&
    document.querySelector('.product-subtitle')?.textContent === 'npm Packed Web-Asset Preflight', 'Public brand and subtitle rendered');
  check(!/\bB08\b|Source repository link pending/iu.test(document.querySelector('#root')!.textContent!), 'Internal branding and source placeholder absent');
  check(document.querySelector<HTMLAnchorElement>('#source a')?.href === 'https://github.com/wisanyaphongtseng/tarballguard', 'Source fallback uses public GitHub repository');
  check(document.querySelector('h1')!.textContent === "Check what you're actually publishing to npm.", 'Visitor headline states purpose');
  check(document.body.textContent!.includes('Your package is not uploaded.') && document.body.textContent!.includes('Current v0 limitations'), 'Privacy and limitations visible');
  button('Run sample scan').click();
  await waitFor(() => status().includes('Scan complete'), 'Example did not complete');
  check(scans === 1 && results === 1 && exampleFileSent, 'Example File sent through actual native worker; real result received');
  check(document.querySelector('form')!.dataset.inputKind === 'example', 'Demo state identifiable');
  check(document.querySelector('.demo-note')!.textContent!.includes('synthetic demo'), 'Demo labelled separately from user package');
  check(document.querySelector('.filename')?.textContent === 'Synthetic sample.tgz', 'Sample display avoids internal fixture name');
  check(document.querySelector('.missing-section')!.textContent!.includes('app.js') && document.querySelector('#found-heading')?.textContent === 'Validated references', 'Example reports app.js missing and style.css found');
  button('Scan another package').click();
  await waitFor(() => status().includes('Choose a package'), 'Reset failed');
  check(!document.querySelector('.audit-report') && document.querySelector('form')!.dataset.inputKind === 'none', 'Reset clears report and demo identity');
  check(document.activeElement?.classList.contains('drop-zone') === true, 'Reset returns focus to package picker');
  const data = new DataTransfer();
  data.items.add(new File([Uint8Array.from(atob(missingReferenceBase64), character => character.charCodeAt(0))], 'user-package.tgz'));
  document.querySelector('.drop-zone')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  await waitFor(() => status().includes('Ready to scan'), 'Real file selection');
  check(document.querySelector('form')!.dataset.inputKind === 'user' && !document.querySelector('.demo-note'), 'Real package selection clears demo label');
  button('Scan package').click();
  await waitFor(() => status().includes('Scan complete'), 'Real package scan');
  check(scans === 2 && results === 2 && status().includes('ISSUES_FOUND'), 'Real .tgz scan still uses actual worker');
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  check(resources.every(item => new URL(item.name).origin === location.origin), 'Observed resource requests contain local app assets only');
  check(document.documentElement.scrollWidth <= document.documentElement.clientWidth, 'No horizontal overflow');
  window.Worker = NativeWorker;
  log('BROWSER LAUNCH SMOKE COMPLETE');
}
void verify().catch(error => { window.Worker = NativeWorker; log('BROWSER LAUNCH SMOKE FAILED: ' + error.message); });
