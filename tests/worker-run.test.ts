import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { runScan, serializeScanError } from '../src/worker/run-scan';
import type { ScanResponse } from '../src/worker/protocol';
import { ArchiveError } from '../src/engine/archive-model';
import { RequiredFilePolicyError } from '../src/engine/required-files';
import { tgzFixture } from './archive-fixture';
import { missingReferenceBase64 } from './browser/worker-smoke-fixtures';

async function scan(input: ArrayBuffer | File, requiredPaths: readonly string[] = []) {
  const messages: ScanResponse[] = [];
  await runScan({ type: 'SCAN', requestId: 17, input, requiredPaths }, message => messages.push(structuredClone(message)));
  expect(messages[0]).toEqual({ type: 'SCAN_STARTED', requestId: 17 });
  expect(messages.every(message => message.requestId === 17)).toBe(true);
  return messages[1];
}

test.each([
  ['valid', '<img src=app.js>', 'CHECKED_NO_ISSUES'],
  ['missing', '<img src=missing.js>', 'ISSUES_FOUND'],
  ['unknown', '<img src=app.js><img src=/runtime.js>', 'CHECKED_WITH_UNKNOWNS'],
  ['no assertions', '', 'NOT_AUDITABLE'],
] as const)('handler composes %s package', async (_name, html, outcome) => {
  const response = await scan(tgzFixture([{ path: 'package/index.html', content: html }, { path: 'package/app.js' }]));
  expect(response).toMatchObject({ type: 'SCAN_RESULT', result: { outcome } });
});

test('real missing-reference fixture retains evidence', async () => {
  const input = Uint8Array.from(readFileSync(new URL('./fixtures/missing-reference.tgz', import.meta.url))).buffer;
  expect(Buffer.from(missingReferenceBase64, 'base64')).toEqual(Buffer.from(input));
  expect(await scan(input)).toMatchObject({ type: 'SCAN_RESULT', result: { outcome: 'ISSUES_FOUND',
    htmlFindings: [{ status: 'FOUND', targetPath: 'style.css' },
      { status: 'MISSING', targetPath: 'app.js', reference: { value: './app.js', location: { line: 2, column: 9 } } }] } });
});

test('File input and missing required fixture', async () => {
  const bytes = Uint8Array.from(readFileSync(new URL('./fixtures/missing-required-file.tgz', import.meta.url)));
  expect(await scan(new File([bytes], 'local.tgz'), ['dist/index.html'])).toMatchObject({
    type: 'SCAN_RESULT', result: { outcome: 'ISSUES_FOUND', requiredFileFindings: [{ status: 'MISSING' }] },
  });
});

test.each([
  ['gzip', new ArrayBuffer(10), 'INVALID_GZIP'],
  ['unsafe', tgzFixture([{ path: 'package/../bad' }]), 'UNSAFE_PATH'],
  ['unsupported', tgzFixture([{ path: 'package/x', type: 'x' }]), 'UNSUPPORTED_TAR'],
] as const)('archive %s rejection has no partial audit', async (_name, input, code) => {
  const response = await scan(input);
  expect(response).toMatchObject({ type: 'SCAN_ERROR', error: { code } });
  expect(response).not.toHaveProperty('result');
});

test('invalid required policy preserves code and index', async () => {
  expect(await scan(tgzFixture([]), ['../unsafe'])).toMatchObject({
    type: 'SCAN_ERROR', error: { code: 'INVALID_POLICY', entryIndex: 0 },
  });
});

test('HTML coverage limitation is a successful result', async () => {
  expect(await scan(tgzFixture([
    { path: 'package/app.js' }, { path: 'package/a.html', content: '<img src=app.js>' },
    { path: 'package/b.html', content: '<!-->' },
  ]))).toMatchObject({ type: 'SCAN_RESULT', result: { outcome: 'CHECKED_WITH_UNKNOWNS',
    htmlCoverageIssues: [{ code: 'HTML_COMPLEXITY_LIMIT' }] } });
});

test('error serialization preserves known codes without stack traces', () => {
  expect(serializeScanError(new ArchiveError('LIMIT_EXCEEDED', 'Archive exceeds the limit.')))
    .toEqual({ code: 'LIMIT_EXCEEDED', message: 'Archive exceeds the limit.' });
  expect(serializeScanError(new RequiredFilePolicyError('Invalid policy.', 2)))
    .toEqual({ code: 'INVALID_POLICY', message: 'Invalid policy.', entryIndex: 2 });
  expect(serializeScanError(new Error('private content and stack')))
    .toEqual({ code: 'INTERNAL_ERROR', message: 'Package scan failed unexpectedly.' });
});
