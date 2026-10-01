import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { createExamplePackage } from '../src/ui/example-package';
import { DEFAULT_SOURCE_REPOSITORY_URL, sourceRepositoryUrl } from '../src/ui/source-link';
import { LaunchNotes } from '../src/ui/Onboarding';
import { ScanWorkflow, scanErrorMessage } from '../src/ui/scan-workflow';
import { ScanError } from '../src/worker/client';
import { runScan } from '../src/worker/run-scan';
import type { ScanResponse } from '../src/worker/protocol';
import type { PackageAudit } from '../src/engine/package-audit';

test('example is deterministic synthetic missing-reference fixture with no archive construction in UI', async () => {
  const example = createExamplePackage();
  const expected = await readFile(new URL('./fixtures/missing-reference.tgz', import.meta.url));
  expect(Buffer.from(await example.arrayBuffer())).toEqual(expected);
  expect(example.name).toBe('b08-example.tgz');
  expect(example.lastModified).toBe(0);
});

test('example goes through existing worker handler and produces real missing evidence', async () => {
  const messages: ScanResponse[] = [];
  await runScan({ type: 'SCAN', requestId: 10, input: createExamplePackage(), requiredPaths: [] }, item => messages.push(item));
  expect(messages).toMatchObject([
    { type: 'SCAN_STARTED', requestId: 10 },
    { type: 'SCAN_RESULT', requestId: 10, result: { outcome: 'ISSUES_FOUND', summary: { found: 1, missing: 1, checkedAssertions: 2 },
      htmlFindings: [{ status: 'FOUND', targetPath: 'style.css' }, { status: 'MISSING', targetPath: 'app.js', reference: { value: './app.js' } }] } },
  ]);
});

test('demo identity survives completion, policy edit and rescan; real selection and reset clear it', async () => {
  const scan = vi.fn(async (input: File, requiredPaths: readonly string[]) => {
    let audit!: PackageAudit;
    await runScan({ type: 'SCAN', requestId: 1, input, requiredPaths }, response => {
      if (response.type === 'SCAN_RESULT') audit = response.result;
    });
    return audit;
  });
  const workflow = new ScanWorkflow({ scan, cancel: vi.fn() });
  workflow.setRequiredText('../invalid');
  const pending = workflow.tryExample();
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'scanning', inputKind: 'example', requiredText: '' });
  expect(scan).toHaveBeenCalledWith(expect.any(File), []);
  await pending;
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'completed', inputKind: 'example', audit: { outcome: 'ISSUES_FOUND' } });
  workflow.setRequiredText('style.css');
  expect(workflow.getSnapshot().inputKind).toBe('example');
  await workflow.start();
  expect(workflow.getSnapshot().inputKind).toBe('example');
  // Filename alone never identifies demos: a user's file may have the same name.
  workflow.selectFiles([new File([], 'b08-example.tgz')]);
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'ready', inputKind: 'user' });
  expect(workflow.getSnapshot().audit).toBeUndefined();
  workflow.removeFile();
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'idle', inputKind: null, file: null });
});

test('Try example cannot start a second scan while active', async () => {
  const client = { scan: vi.fn(() => new Promise<PackageAudit>(() => {})), cancel: vi.fn() };
  const workflow = new ScanWorkflow(client);
  void workflow.tryExample();
  await workflow.tryExample();
  expect(client.scan).toHaveBeenCalledOnce();
  expect(workflow.getSnapshot().inputKind).toBe('example');
  workflow.cancel();
  expect(client.cancel).toHaveBeenCalledOnce();
  expect(workflow.getSnapshot()).toMatchObject({ phase: 'cancelled', inputKind: 'example' });
});

test('source configuration overrides fallback with a valid deployment-owned HTTPS link', () => {
  expect(sourceRepositoryUrl(' https://github.com/example/project ')).toBe('https://github.com/example/project');
  expect(renderToStaticMarkup(<LaunchNotes sourceUrl="https://github.com/example/project" />))
    .toContain('<a href="https://github.com/example/project" rel="noreferrer">View source on GitHub</a>');
});

test.each([undefined, '', 'javascript:alert(1)', 'data:text/html,x', '/guess', 'http://example.test', 'https://user:secret@example.test', 'garbage'])
  ('missing/unsafe source configuration uses known public repository: %s', value => {
    expect(sourceRepositoryUrl(value)).toBe(DEFAULT_SOURCE_REPOSITORY_URL);
    const html = renderToStaticMarkup(<LaunchNotes sourceUrl={value} />);
    expect(html).toContain('href="https://github.com/wisanyaphongtseng/tarballguard"');
    expect(html).toContain('View source on GitHub');
    expect(html).not.toMatch(/pending|B08/iu);
  });

test('unsupported archive copy states support limitation and absence of clean result without blaming package', () => {
  const message = scanErrorMessage(new ScanError({ code: 'UNSUPPORTED_TAR', message: 'private contents' }));
  expect(message).toContain('does not support yet');
  expect(message).toContain('No clean result was produced.');
  expect(message).toContain('does not mean the package is broken');
  expect(message).not.toContain('private');
});

test('static metadata is meaningful with no remote image or invented canonical URL', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  expect(html).toContain('<title>TarballGuard — npm Packed Web-Asset Preflight</title>');
  expect(html).toContain('name="description"');
  expect(html).toContain('property="og:title"');
  expect(html).toContain('property="og:description"');
  expect(html).toContain('name="viewport"');
  expect(html).not.toMatch(/og:image|og:url|rel="canonical"/u);
});
