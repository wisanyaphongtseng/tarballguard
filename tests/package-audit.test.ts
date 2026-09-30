import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ingestArchive } from '../src/engine/archive';
import { auditPackage } from '../src/engine/package-audit';
import { HtmlExtractionError, MAX_HTML_BYTES } from '../src/engine/html-references';
import * as htmlScan from '../src/engine/html-scan';
import { RequiredFilePolicyError } from '../src/engine/required-files';
import { tgzFixture } from './archive-fixture';
import type { FixtureEntry } from './archive-fixture';

afterEach(() => vi.restoreAllMocks());

async function indexWithHtml(html: string, extra: FixtureEntry[] = []) {
  return ingestArchive(tgzFixture([{ path: 'package/index.html', content: html }, ...extra]));
}

describe('honest package outcomes', () => {
  test.each([
    ['<script src=app.js></script>', true, [], 'CHECKED_NO_ISSUES', 1],
    ['<script src=missing.js></script>', true, [], 'ISSUES_FOUND', 1],
    ['<p>No references</p>', false, ['dist/index.html'], 'ISSUES_FOUND', 1],
    ['<script src=https://example.com/app.js></script>', false, [], 'NOT_AUDITABLE', 0],
    ['<script src=/assets/app.js></script>', false, [], 'NOT_AUDITABLE', 0],
    ['<script src=app.js></script><img src=/runtime.svg>', true, [], 'CHECKED_WITH_UNKNOWNS', 1],
    ['<img src=/runtime.svg>', true, ['app.js'], 'CHECKED_WITH_UNKNOWNS', 1],
    ['<script src=missing.js></script><img src=/runtime.svg>', false, [], 'ISSUES_FOUND', 1],
    ['<script src=app.js></script>', true, ['missing.css'], 'ISSUES_FOUND', 2],
    ['<script src=app.js></script><script src=https://example.com/lib.js></script>', true, [], 'CHECKED_NO_ISSUES', 1],
    ['<p>No references</p>', false, [], 'NOT_AUDITABLE', 0],
  ] as const)('applies the exact outcome decision for case %#', async (html, hasApp, required, outcome, checkedAssertions) => {
    const index = await indexWithHtml(html, hasApp ? [{ path: 'package/app.js' }] : []);
    const result = auditPackage(index, required);
    expect(result.outcome).toBe(outcome);
    expect(result.summary.checkedAssertions).toBe(checkedAssertions);
  });

  test('required FOUND with no HTML is a checked assertion', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/README.md' }]));
    const result = auditPackage(index, ['README.md', './README.md']);
    expect(result.outcome).toBe('CHECKED_NO_ISSUES');
    expect(result.requiredFileFindings).toEqual([{ path: 'README.md', status: 'FOUND' }]);
    expect(result.summary.checkedAssertions).toBe(1);
  });

  test('README-only package without policy is NOT_AUDITABLE', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/README.md' }]));
    expect(auditPackage(index)).toEqual({
      outcome: 'NOT_AUDITABLE', requiredFileFindings: [], htmlFindings: [],
      htmlFilesScanned: [], htmlCoverageIssues: [],
      summary: { found: 0, missing: 0, unknown: 0, skipped: 0, checkedAssertions: 0,
        htmlFilesDiscovered: 0, htmlFilesScanned: 0, htmlFilesNotScanned: 0 },
    });
    expect(auditPackage(index, [])).toEqual(auditPackage(index));
  });

  test('acceptance B checks two local references while retaining external SKIPPED', async () => {
    const index = await indexWithHtml('<link href="./style.css"><script src="./app.js"></script>' +
      '<script src="https://cdn.example.com/lib.js"></script>', [
      { path: 'package/app.js' }, { path: 'package/style.css' },
    ]);
    const result = auditPackage(index);
    expect(result.outcome).toBe('CHECKED_NO_ISSUES');
    expect(result.htmlFindings.map(finding => finding.status)).toEqual(['FOUND', 'FOUND', 'SKIPPED']);
    expect(result.summary).toEqual({ found: 2, missing: 0, unknown: 0, skipped: 1, checkedAssertions: 2,
      htmlFilesDiscovered: 1, htmlFilesScanned: 1, htmlFilesNotScanned: 0 });
    expect(result).not.toHaveProperty('pass');
  });

  test('acceptance A audits the actual deterministic missing-reference tgz', async () => {
    const input = Uint8Array.from(readFileSync(new URL('./fixtures/missing-reference.tgz', import.meta.url)));
    const index = await ingestArchive(input.buffer);
    const result = auditPackage(index);
    expect(result.outcome).toBe('ISSUES_FOUND');
    expect(result.htmlFindings).toEqual(htmlScan.scanHtmlFile(index, 'index.html'));
    expect(result.htmlFindings).toMatchObject([
      { status: 'FOUND', targetPath: 'style.css' },
      { status: 'MISSING', targetPath: 'app.js', reference: { value: './app.js', location: { line: 2, column: 9 } } },
    ]);
    expect(result.summary.checkedAssertions).toBe(2);
  });
});

describe('HTML coverage and invariants', () => {
  test.each([
    ['HTML_TOO_LARGE', new Uint8Array(MAX_HTML_BYTES + 1)],
    ['INVALID_UTF8', new Uint8Array([0xff])],
  ] as const)('records known scan limitation %s', async (code, content) => {
    const index = await indexWithHtml('<script src=app.js></script>', [
      { path: 'package/app.js' }, { path: 'package/broken.html', content },
    ]);
    const result = auditPackage(index);
    expect(result.outcome).toBe('CHECKED_WITH_UNKNOWNS');
    expect(result.htmlFilesScanned).toEqual(['index.html']);
    expect(result.htmlCoverageIssues).toEqual([{ htmlPath: 'broken.html', code, reason: expect.any(String) }]);
    expect(result.summary).toEqual({ found: 1, missing: 0, unknown: 0, skipped: 0, checkedAssertions: 1,
      htmlFilesDiscovered: 2, htmlFilesScanned: 1, htmlFilesNotScanned: 1 });
  });

  test('all supported HTML unscannable with no policy is NOT_AUDITABLE', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/b.html', content: new Uint8Array([0xff]) },
      { path: 'package/a.htm', content: new Uint8Array(MAX_HTML_BYTES + 1) },
    ]));
    const result = auditPackage(index);
    expect(result.outcome).toBe('NOT_AUDITABLE');
    expect(result.summary.checkedAssertions).toBe(0);
    expect(result.htmlFilesScanned).toEqual([]);
    expect(result.htmlCoverageIssues.map(issue => issue.htmlPath)).toEqual(['a.htm', 'b.html']);
  });

  test('required FOUND plus an unscannable HTML file keeps coverage unknown', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/index.html', content: new Uint8Array([0xff]) }]));
    expect(auditPackage(index, ['index.html'])).toMatchObject({
      outcome: 'CHECKED_WITH_UNKNOWNS', summary: { found: 1, checkedAssertions: 1, htmlFilesNotScanned: 1 },
    });
    expect(auditPackage(index, ['missing.js']).outcome).toBe('ISSUES_FOUND');
  });

  test('scans remaining files after a coverage failure and missing assets still win', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/a.html', content: new Uint8Array([0xff]) },
      { path: 'package/z.html', content: '<script src=missing.js></script>' },
    ]));
    expect(auditPackage(index)).toMatchObject({ outcome: 'ISSUES_FOUND',
      htmlFilesScanned: ['z.html'], summary: { missing: 1, checkedAssertions: 1, htmlFilesNotScanned: 1 } });
  });

  test.each([
    new Error('Programmer bug'), new RangeError('Invariant failure'),
    new HtmlExtractionError('INVALID_INPUT', 'Wrong payload type'), new htmlScan.HtmlScanError(),
  ])('does not swallow unexpected error %s', async error => {
    const index = await indexWithHtml('<img src=x>');
    vi.spyOn(htmlScan, 'scanHtmlFile').mockImplementationOnce(() => { throw error; });
    expect(() => auditPackage(index)).toThrow(error);
  });

  test('invalid required policy is an explicit error before HTML scanning', async () => {
    const index = await indexWithHtml('<script src=missing.js></script>');
    const spy = vi.spyOn(htmlScan, 'scanHtmlFile');
    expect(() => auditPackage(index, ['../outside'])).toThrow(RequiredFilePolicyError);
    expect(() => auditPackage(index, null as unknown as readonly string[])).toThrow(RequiredFilePolicyError);
    expect(spy).not.toHaveBeenCalled();
  });

  test('discovers shared extensions, excludes directories, and preserves source order and duplicates', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/z.HTML', content: '<img src=z.svg><img src=a.svg><img src=z.svg>' },
      { path: 'package/a.htm', content: '<script src=app.js></script>' },
      { path: 'package/app.js' }, { path: 'package/z.svg' }, { path: 'package/a.svg' },
      { path: 'package/ignored.html/', type: '5' },
      { path: 'package/ignored.txt', content: '<img src=missing>' },
    ]));
    const result = auditPackage(index);
    expect(result.htmlFilesScanned).toEqual(['a.htm', 'z.HTML']);
    expect(result.htmlFindings.map(finding => [finding.htmlPath, finding.reference.value])).toEqual([
      ['a.htm', 'app.js'], ['z.HTML', 'z.svg'], ['z.HTML', 'a.svg'], ['z.HTML', 'z.svg'],
    ]);
    expect(result.summary.checkedAssertions).toBe(4);
    expect(auditPackage({ ...index, files: [...index.files].reverse() })).toEqual(result);
  });

  test('summary counts findings separately from coverage and preserves all frozen structures', async () => {
    const index = await indexWithHtml('<img src=app.js><img src=missing.svg><img src=/runtime.svg>' +
      '<script src=https://example.com/lib.js></script>', [
      { path: 'package/app.js' }, { path: 'package/broken.html', content: new Uint8Array([0xff]) },
    ]);
    const result = auditPackage(index, ['app.js', './app.js', 'missing.css']);
    expect(result.summary).toEqual({ found: 2, missing: 2, unknown: 1, skipped: 1, checkedAssertions: 4,
      htmlFilesDiscovered: 2, htmlFilesScanned: 1, htmlFilesNotScanned: 1 });
    const objects = [result, result.summary, result.requiredFileFindings, result.htmlFindings,
      result.htmlFilesScanned, result.htmlCoverageIssues, ...result.requiredFileFindings,
      ...result.htmlFindings, ...result.htmlCoverageIssues,
      ...result.htmlFindings.map(finding => finding.reference),
      ...result.htmlFindings.map(finding => finding.reference.location)];
    for (const object of objects) expect(Object.isFrozen(object)).toBe(true);
  });
});
