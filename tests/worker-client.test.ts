import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PackageScanClient, SCAN_TIMEOUT_MS } from '../src/worker/client';
import type { ScanRequest, ScanResponse } from '../src/worker/protocol';
import { auditPackage } from '../src/engine/package-audit';

// A transport double only: these tests do not claim browser Worker execution.
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ScanResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((_request: ScanRequest, _transfer: Transferable[]) => {});
  constructor(public url: URL, public options: WorkerOptions) { FakeWorker.instances.push(this); }
  reply(response: ScanResponse) { this.onmessage?.({ data: structuredClone(response) } as MessageEvent<ScanResponse>); }
}
const result = auditPackage({ files: [], entryCount: 0, decompressedBytes: 1024 });
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('module worker request uses transfer list and required policy', async () => {
  const client = new PackageScanClient();
  const input = new ArrayBuffer(8);
  const scan = client.scan(input, ['app.js']);
  const worker = FakeWorker.instances[0];
  expect(worker.options).toEqual({ type: 'module' });
  expect(worker.url.pathname).toContain('scan.worker.ts');
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SCAN', requestId: 1, input, requiredPaths: ['app.js'] }, [input]);
  worker.reply({ type: 'SCAN_RESULT', requestId: 1, result });
  expect(await scan).toEqual(result);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('File is sent without a transfer list', async () => {
  const client = new PackageScanClient();
  const input = new File(['local'], 'package.tgz');
  const scan = client.scan(input);
  const handled = expect(scan).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ input }), []);
  client.cancel();
  await handled;
});

test('wrong request IDs and STARTED cannot settle a scan', async () => {
  const client = new PackageScanClient();
  const scan = client.scan(new ArrayBuffer(8));
  const worker = FakeWorker.instances[0];
  worker.reply({ type: 'SCAN_RESULT', requestId: 99, result });
  worker.reply({ type: 'SCAN_ERROR', requestId: 99, error: { code: 'INTERNAL_ERROR', message: 'wrong scan' } });
  worker.reply({ type: 'SCAN_STARTED', requestId: 1 });
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.reply({ type: 'SCAN_RESULT', requestId: 1, result });
  expect(await scan).toEqual(result);
});

test('new scan cancels previous and ignores even queued stale responses', async () => {
  const client = new PackageScanClient();
  const first = client.scan(new ArrayBuffer(8));
  const cancelled = expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
  const old = FakeWorker.instances[0];
  const queued = old.onmessage!;
  const next = client.scan(new ArrayBuffer(8));
  await cancelled;
  expect(old.terminate).toHaveBeenCalledOnce();
  queued({ data: { type: 'SCAN_RESULT', requestId: 1, result } } as MessageEvent<ScanResponse>);
  expect(FakeWorker.instances[1].terminate).not.toHaveBeenCalled();
  FakeWorker.instances[1].reply({ type: 'SCAN_RESULT', requestId: 2, result });
  await expect(next).resolves.toEqual(result);
});

test('timeout terminates worker and permits a fresh scan', async () => {
  const client = new PackageScanClient();
  const scan = client.scan(new ArrayBuffer(8));
  const timedOut = expect(scan).rejects.toMatchObject({ code: 'TIMEOUT' });
  vi.advanceTimersByTime(SCAN_TIMEOUT_MS - 1);
  expect(FakeWorker.instances[0].terminate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  await timedOut;
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  const next = client.scan(new ArrayBuffer(8));
  FakeWorker.instances[1].reply({ type: 'SCAN_RESULT', requestId: 2, result });
  await expect(next).resolves.toEqual(result);
});

test('worker structured errors become typed client errors', async () => {
  const client = new PackageScanClient();
  const scan = client.scan(new ArrayBuffer(8));
  FakeWorker.instances[0].reply({ type: 'SCAN_ERROR', requestId: 1,
    error: { code: 'INVALID_POLICY', message: 'Invalid policy.', entryIndex: 0 } });
  await expect(scan).rejects.toMatchObject({ name: 'ScanError', code: 'INVALID_POLICY', entryIndex: 0 });
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

test.each(['error', 'messageerror'] as const)('%s is explicit worker failure', async kind => {
  const scan = new PackageScanClient().scan(new ArrayBuffer(8));
  const worker = FakeWorker.instances[0];
  if (kind === 'error') worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
  else worker.onmessageerror!();
  await expect(scan).rejects.toMatchObject({ code: 'WORKER_FAILED' });
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test('constructor failure clears active scan and timer', async () => {
  vi.stubGlobal('Worker', class { constructor() { throw new Error('private'); } });
  const client = new PackageScanClient();
  await expect(client.scan(new ArrayBuffer(8))).rejects.toMatchObject({ code: 'WORKER_FAILED' });
  expect(vi.getTimerCount()).toBe(0);
  client.cancel();
});

test('postMessage failure terminates worker without leaking timer', async () => {
  // Class fields are per-instance; replace the constructor for this failure probe.
  vi.stubGlobal('Worker', class extends FakeWorker {
    postMessage = vi.fn(() => { throw new Error('private'); });
  });
  await expect(new PackageScanClient().scan(new ArrayBuffer(8))).rejects.toMatchObject({ code: 'TRANSFER_FAILED' });
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('structured clone loses freeze; client restores nested result immutability', async () => {
  const client = new PackageScanClient();
  const scan = client.scan(new ArrayBuffer(8));
  const bytes = new TextEncoder().encode('<img src=app.js>');
  const populated = auditPackage({ files: [
    { path: 'index.html', size: bytes.length, bytes },
    { path: 'app.js', size: 0, bytes: new Uint8Array() },
    { path: 'bad.html', size: 5, bytes: new TextEncoder().encode('<!-->') },
  ], entryCount: 3, decompressedBytes: 4096 }, ['app.js']);
  const clone = structuredClone(populated);
  expect(Object.isFrozen(clone)).toBe(false);
  FakeWorker.instances[0].reply({ type: 'SCAN_RESULT', requestId: 1, result: clone });
  const output = await scan;
  expect(Object.isFrozen(output)).toBe(true);
  expect(Object.isFrozen(output.summary)).toBe(true);
  expect(Object.isFrozen(output.htmlFindings)).toBe(true);
  expect(Object.isFrozen(output.htmlCoverageIssues)).toBe(true);
  expect(Object.isFrozen(output.htmlCoverageIssues[0])).toBe(true);
  expect(Object.isFrozen(output.requiredFileFindings[0])).toBe(true);
  expect(Object.isFrozen(output.htmlFindings[0])).toBe(true);
  expect(Object.isFrozen(output.htmlFindings[0].reference)).toBe(true);
  expect(Object.isFrozen(output.htmlFindings[0].reference.location)).toBe(true);
});
