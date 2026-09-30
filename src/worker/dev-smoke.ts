import type { PackageScanClient } from './client';
import { ScanError } from './client';
import type { ScanResponse } from './protocol';
import { busyPackageBase64, missingReferenceBase64 } from '../../tests/browser/worker-smoke-fixtures';

/** Developer-only actual-browser verification; no fixture requests or package uploads. */
export async function runWorkerSmoke(client: PackageScanClient, report: (text: string) => void): Promise<void> {
  const RealWorker = window.Worker;
  let started = 0;
  let terminated = 0;
  let transferred = 0;
  let notifyStarted: (() => void) | undefined;
  class ObservedWorker extends RealWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      this.addEventListener('message', (event: MessageEvent<ScanResponse>) => {
        if (event.data.type === 'SCAN_STARTED') { started++; notifyStarted?.(); }
      });
    }
    postMessage(message: unknown, options: Transferable[] | StructuredSerializeOptions = []): void {
      const transfer = Array.isArray(options) ? options : options.transfer ?? [];
      if (Array.isArray(options)) super.postMessage(message, options);
      else super.postMessage(message, options);
      if (transfer.length && transfer[0] instanceof ArrayBuffer && transfer[0].byteLength === 0) transferred++;
    }
    terminate(): void { terminated++; super.terminate(); }
  }
  window.Worker = ObservedWorker;
  const bytes = (base64: string) => Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer;
  const lines: string[] = [];
  const check = (condition: boolean, text: string) => {
    if (!condition) throw new Error(text);
    lines.push(text);
    report(lines.join('\n'));
  };
  let heartbeat = 0;
  const interval = setInterval(() => heartbeat++, 5);
  try {
    const input = bytes(missingReferenceBase64);
    const first = await client.scan(input);
    check(input.byteLength === 0, 'ArrayBuffer transferred and detached');
    check(first.outcome === 'ISSUES_FOUND' && first.summary.missing === 1,
      'Real missing-reference fixture: ISSUES_FOUND');
    check(first.htmlFindings[1].reference.location?.line === 2, 'Source location preserved');
    check(Object.isFrozen(first.htmlFindings[1].reference), 'Cloned reference refrozen');

    const before = heartbeat;
    const busy = await client.scan(bytes(busyPackageBase64));
    check(heartbeat > before, `Main thread heartbeat during worker scan: ${heartbeat - before}`);
    check(busy.outcome === 'CHECKED_WITH_UNKNOWNS' && busy.htmlCoverageIssues.length > 0,
      'Coverage limitations remain successful audit results');

    const acknowledged = new Promise<void>(resolve => { notifyStarted = resolve; });
    const pending = client.scan(bytes(busyPackageBase64));
    const cancelled = pending.then(() => false, error => error instanceof ScanError && error.code === 'CANCELLED');
    await acknowledged;
    notifyStarted = undefined;
    client.cancel();
    check(await cancelled, 'Active acknowledged worker scan cancelled');
    const afterCancel = await client.scan(new File([bytes(missingReferenceBase64)], 'local-fixture.tgz'));
    check(afterCancel.outcome === 'ISSUES_FOUND', 'Worker recreated after cancellation; File input works');

    let rejected = false;
    try { await client.scan(new ArrayBuffer(10)); }
    catch (error) { rejected = error instanceof ScanError && error.code === 'INVALID_GZIP'; }
    check(rejected, 'Archive error serialized as INVALID_GZIP');
    check((await client.scan(bytes(missingReferenceBase64))).outcome === 'ISSUES_FOUND',
      'Worker recreated after archive error');
    check(started === 6 && terminated === 6 && transferred === 5,
      `Real workers: ${started} started, ${terminated} terminated, ${transferred} buffers transferred`);
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const workerResources = resources.filter(resource => resource.name.includes('scan.worker'));
    lines.push(`Observed worker module loads: ${workerResources.length}`);
    lines.push('Observed page resource requests: ' + resources.map(resource => resource.name).join('\n'));
    lines.push('Smoke complete. Fixtures are embedded; harness sends no HTTP package request.');
    report(lines.join('\n'));
  } catch (error) {
    report(lines.join('\n') + '\nSMOKE FAILED: ' + (error instanceof Error ? error.message : 'unknown error'));
  } finally {
    clearInterval(interval);
    client.cancel();
    window.Worker = RealWorker;
  }
}
