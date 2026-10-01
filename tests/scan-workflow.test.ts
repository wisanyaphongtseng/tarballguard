import { expect, test, vi } from 'vitest';
import { canScan, requiredPathsFromText, ScanWorkflow, scanErrorMessage } from '../src/ui/scan-workflow';
import { readableFileSize, visibleFileName } from '../src/ui/file-display';
import { ScanError } from '../src/worker/client';
import type { PackageAudit } from '../src/engine/package-audit';
import { auditPackage } from '../src/engine/package-audit';

const audit = auditPackage({ files: [], entryCount: 0, decompressedBytes: 1024 });
const file = () => new File(['untrusted'], 'package.tgz');
function setup() {
  let resolve!: (audit: PackageAudit) => void;
  let reject!: (error: unknown) => void;
  const pending = new Promise<PackageAudit>((yes, no) => { resolve = yes; reject = no; });
  const client = { scan: vi.fn(() => pending), cancel: vi.fn() };
  return { workflow: new ScanWorkflow(client), client, resolve, reject };
}

test('no file disables scan; selecting enables ready; removal returns idle', async () => {
  const { workflow, client } = setup();
  expect(workflow.getSnapshot().phase).toBe('idle');
  expect(canScan(workflow.getSnapshot())).toBe(false);
  await workflow.start();
  expect(client.scan).not.toHaveBeenCalled();
  workflow.selectFiles([file()]);
  expect(workflow.getSnapshot().phase).toBe('ready');
  expect(canScan(workflow.getSnapshot())).toBe(true);
  workflow.removeFile();
  expect(workflow.getSnapshot().phase).toBe('idle');
  expect(canScan(workflow.getSnapshot())).toBe(false);
});

test('required text preserves paths and duplicates; filters only blank lines', () => {
  expect(requiredPathsFromText('dist/app.js\r\n\t \n ./dist//app.js \r../unsafe\ndist/app.js\n'))
    .toEqual(['dist/app.js', ' ./dist//app.js ', '../unsafe', 'dist/app.js']);
  expect(requiredPathsFromText(' \n\r\n\t')).toEqual([]);
});

test('scan sends original File and raw policy; blocks double-submit synchronously', async () => {
  const { workflow, client, resolve } = setup();
  const selected = file();
  workflow.selectFiles([selected]);
  workflow.setRequiredText('./app.js\n\n./app.js\n spaced.js ');
  const scan = workflow.start();
  expect(workflow.getSnapshot().phase).toBe('scanning');
  expect(canScan(workflow.getSnapshot())).toBe(false);
  await workflow.start();
  expect(client.scan).toHaveBeenCalledOnce();
  expect(client.scan).toHaveBeenCalledWith(selected, ['./app.js', './app.js', ' spaced.js ']);
  workflow.setRequiredText('ignored while scanning');
  expect(workflow.getSnapshot().requiredText).toContain('./app.js');
  resolve(audit);
  await scan;
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'completed', audit });
  expect(workflow.getSnapshot().audit).toBe(audit);
});

test('cancel calls client; late success cannot replace cancelled state', async () => {
  const { workflow, client, resolve } = setup();
  workflow.selectFiles([file()]);
  const scan = workflow.start();
  workflow.cancel();
  expect(client.cancel).toHaveBeenCalledOnce();
  expect(workflow.getSnapshot().phase).toBe('cancelled');
  expect(canScan(workflow.getSnapshot())).toBe(true);
  resolve(audit);
  await scan;
  expect(workflow.getSnapshot().phase).toBe('cancelled');
  expect(workflow.getSnapshot().audit).toBeUndefined();
});

test('cancelled reply cannot overwrite an immediately retried active scan', async () => {
  const { workflow, client, resolve } = setup();
  workflow.selectFiles([file()]);
  const first = workflow.start(); workflow.cancel();
  let resolveNext!: (audit: PackageAudit) => void;
  client.scan.mockReturnValueOnce(new Promise<PackageAudit>(yes => { resolveNext = yes; }));
  const next = workflow.start();
  resolve(audit); await first;
  expect(workflow.getSnapshot().phase).toBe('scanning');
  resolveNext(audit); await next;
  expect(workflow.getSnapshot().phase).toBe('completed');
});

test.each(['select', 'remove'] as const)('%s during scan cancels and ignores stale failure', async action => {
  const { workflow, client, reject } = setup();
  workflow.selectFiles([file()]);
  const scan = workflow.start();
  if (action === 'select') workflow.selectFiles([new File([], 'new.tgz')]);
  else workflow.removeFile();
  expect(client.cancel).toHaveBeenCalledOnce();
  reject(new Error('secret package contents'));
  await scan;
  expect(workflow.getSnapshot().phase).toBe(action === 'select' ? 'ready' : 'idle');
  expect(workflow.getSnapshot().message).toBeUndefined();
});

test.each(['completed', 'error'] as const)('selecting new file clears stale %s', async phase => {
  const { workflow, resolve, reject } = setup();
  workflow.selectFiles([file()]);
  const scan = workflow.start();
  if (phase === 'completed') resolve(audit);
  else reject(new ScanError({ code: 'INVALID_GZIP', message: 'private' }));
  await scan;
  expect(workflow.getSnapshot().phase).toBe(phase);
  workflow.selectFiles([new File([], 'other.tgz')]);
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'ready' });
  expect(workflow.getSnapshot().audit).toBeUndefined();
  expect(workflow.getSnapshot().message).toBeUndefined();
});

test.each(['completed', 'error'] as const)('starting another scan clears stale %s', async phase => {
  const { workflow, client, resolve, reject } = setup();
  workflow.selectFiles([file()]);
  const first = workflow.start();
  if (phase === 'completed') resolve(audit);
  else reject(new Error('private'));
  await first;
  client.scan.mockReturnValueOnce(Promise.resolve(audit));
  const second = workflow.start();
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'scanning' });
  expect(workflow.getSnapshot().audit).toBeUndefined();
  expect(workflow.getSnapshot().message).toBeUndefined();
  await second;
});

test('changing policy clears stale audit without altering path semantics', async () => {
  const { workflow, resolve } = setup();
  workflow.selectFiles([file()]);
  const scan = workflow.start(); resolve(audit); await scan;
  workflow.setRequiredText('../unsafe');
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'ready', requiredText: '../unsafe' });
  expect(workflow.getSnapshot().audit).toBeUndefined();
});

test.each([
  ['INVALID_POLICY', 'required-file path'], ['UNSUPPORTED_TAR', 'does not support yet'],
  ['UNSAFE_PATH', 'unsafe'], ['INVALID_GZIP', 'malformed'], ['LIMIT_EXCEEDED', 'limits'],
  ['TIMEOUT', '30 seconds'], ['WORKER_FAILED', 'could not complete'],
] as const)('%s produces safe, distinct user message', async (code, text) => {
  const { workflow, reject } = setup();
  workflow.selectFiles([file()]);
  const scan = workflow.start();
  reject(new ScanError({ code, message: '<script>private package data</script>' }));
  await scan;
  expect(workflow.getSnapshot().phase).toBe('error');
  expect(workflow.getSnapshot().message).toContain(text);
  expect(workflow.getSnapshot().message).not.toContain('private');
});

test('unexpected failure never displays exception text', () => {
  expect(scanErrorMessage(new Error('private stack trace'))).not.toContain('private');
});
test('client cancellation is non-alarming', async () => {
  const { workflow, reject } = setup(); workflow.selectFiles([file()]);
  const scan = workflow.start(); reject(new ScanError({ code: 'CANCELLED', message: 'private' })); await scan;
  expect(workflow.getSnapshot().phase).toBe('cancelled');
});
test('extension is only a UI hint; one package is required', () => {
  const { workflow } = setup();
  workflow.selectFiles([new File([], 'bad.zip')]);
  expect(canScan(workflow.getSnapshot())).toBe(false);
  workflow.selectFiles([file(), file()]);
  expect(workflow.getSnapshot().message).toContain('one');
  workflow.selectFiles([new File(['not really gzip'], 'upper.TGZ')]);
  expect(workflow.getSnapshot().phase).toBe('ready');
  workflow.selectFiles([]);
  expect(workflow.getSnapshot().file?.name).toBe('upper.TGZ');
});
test('subscriptions are removed and snapshots remain stable until changed', () => {
  const { workflow } = setup();
  const listener = vi.fn(); const initial = workflow.getSnapshot();
  expect(workflow.getSnapshot()).toBe(initial);
  const unsubscribe = workflow.subscribe(listener); workflow.selectFiles([file()]);
  expect(listener).toHaveBeenCalledOnce(); unsubscribe(); workflow.removeFile();
  expect(listener).toHaveBeenCalledOnce();
  expect(Object.isFrozen(workflow.getSnapshot())).toBe(true);
});
test('file size and filename display preserve text safely', () => {
  expect(readableFileSize(0)).toBe('0 B');
  expect(readableFileSize(1024)).toBe('1.0 KiB');
  expect(readableFileSize(1048576)).toBe('1.0 MiB');
  expect(visibleFileName('é\u202e<script>.tgz')).toBe('é\\u202e<script>.tgz');
});
