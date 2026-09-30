import { afterEach, describe, expect, test, vi } from 'vitest';
import * as parse5 from 'parse5';
import { extractHtmlReferences } from '../src/engine/html-references';
import { auditPackage } from '../src/engine/package-audit';
import { ingestArchive } from '../src/engine/archive';
import type { ArchiveIndex } from '../src/engine/archive';
import { tgzFixture } from './archive-fixture';

vi.mock('parse5', async importOriginal => {
  const actual = await importOriginal<typeof import('parse5')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});

const images = (count: number, value = 'app.js') => `<img src="${value}">`.repeat(count);
afterEach(() => vi.restoreAllMocks());
async function packageWith(counts: number[], value = 'app.js') {
  return ingestArchive(tgzFixture([
    { path: 'package/app.js' },
    ...counts.map((count, index) => ({ path: `package/${index}.html`, content: images(count, value) })),
  ]));
}

describe('HTML computational preflight', () => {
  test.each([
    ['nested reviewer reproduction', '<div>'.repeat(90000) + '</div>'.repeat(90000)],
    ['attribute reviewer reproduction', '<div ' + Array.from({ length: 100000 }, (_, i) => `a${i}=x`).join(' ') + '>'],
    ['long tag', '<img src="' + 'x'.repeat(65536) + '">'],
    ['markup count', '<br>'.repeat(25001)],
  ])('rejects %s before parsing', (_name, html) => {
    vi.mocked(parse5.parse).mockClear();
    expect(() => extractHtmlReferences(html)).toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
    expect(parse5.parse).not.toHaveBeenCalled();
  });
  test('accepts inclusive attribute and markup boundaries', () => {
    expect(extractHtmlReferences('<div ' + Array.from({ length: 256 }, (_, i) => `a${i}=x`).join(' ') + '>')).toEqual([]);
    expect(() => extractHtmlReferences('<div ' + Array.from({ length: 257 }, (_, i) => `a${i}=x`).join(' ') + '>'))
      .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
    expect(extractHtmlReferences('<br>'.repeat(25000))).toEqual([]);
  });
  test('accepts realistic HTML and recoverable malformed markup', () => {
    expect(extractHtmlReferences('<!doctype html><main>' + '<section><p>Content</p></section>'.repeat(2000) +
      '<img src="app.js"></main>')).toHaveLength(1);
    expect(extractHtmlReferences('<div><p><img src=app.js><p>unfinished')).toHaveLength(1);
  });
  test('per-file reference cap is inclusive and never returns a partial array', () => {
    expect(extractHtmlReferences(images(5000))).toHaveLength(5000);
    expect(() => extractHtmlReferences(images(5001))).toThrow(expect.objectContaining({ code: 'HTML_REFERENCE_LIMIT' }));
  });
});

describe('package budgets and lookup reuse', () => {
  test('per-file reference exhaustion is explicit unscanned coverage', async () => {
    const result = auditPackage(await packageWith([5001]));
    expect(result.htmlFindings).toHaveLength(0);
    expect(result.htmlFilesScanned).toHaveLength(0);
    expect(result.htmlCoverageIssues).toMatchObject([{ code: 'HTML_REFERENCE_LIMIT' }]);
    expect(result.outcome).toBe('NOT_AUDITABLE');
  });
  test('clean HTML plus structurally rejected HTML retains unknown coverage', async () => {
    const index = await packageWith([1]);
    const bad = await ingestArchive(tgzFixture([{ path: 'package/z.html', content: '<div>'.repeat(90000) }]));
    expect(auditPackage({ ...index, files: [...index.files, ...bad.files] }).outcome)
      .toBe('CHECKED_WITH_UNKNOWNS');
  });
  test('package reference budget is inclusive; next file becomes a coverage gap', async () => {
    const exact = auditPackage(await packageWith([5000, 5000, 5000, 5000, 5000]));
    expect(exact.htmlFindings).toHaveLength(25000);
    expect(exact.outcome).toBe('CHECKED_NO_ISSUES');
    const over = auditPackage(await packageWith([5000, 5000, 5000, 5000, 5000, 1]));
    expect(over.htmlFindings).toHaveLength(25000);
    expect(over.outcome).toBe('CHECKED_WITH_UNKNOWNS');
    expect(over.htmlCoverageIssues).toMatchObject([{ htmlPath: '5.html', code: 'PACKAGE_REFERENCE_LIMIT' }]);
  });
  test('rejects whole overflow file without discarding earlier missing findings', async () => {
    const result = auditPackage(await packageWith([5000, 5000, 5000, 5000, 4999, 2], 'missing.js'));
    expect(result.outcome).toBe('ISSUES_FOUND');
    expect(result.htmlFindings).toHaveLength(24999);
    expect(result.htmlCoverageIssues).toHaveLength(1);
  });
  test('unknown-only references consume package budget without becoming checks', async () => {
    const result = auditPackage(await packageWith([5000, 5000, 5000, 5000, 5000, 1], '/runtime.js'));
    expect(result.outcome).toBe('NOT_AUDITABLE');
    expect(result.summary.checkedAssertions).toBe(0);
    expect(result.htmlFindings).toHaveLength(25000);
    expect(result.htmlCoverageIssues).toHaveLength(1);
  });
  test('pathological files become coverage gaps with exact outcome precedence', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/app.js' },
      { path: 'package/bad.html', content: '<div>'.repeat(90000) },
    ]));
    expect(auditPackage(index)).toMatchObject({ outcome: 'NOT_AUDITABLE',
      htmlCoverageIssues: [{ code: 'HTML_COMPLEXITY_LIMIT' }] });
    expect(auditPackage(index, ['app.js']).outcome).toBe('CHECKED_WITH_UNKNOWNS');
    expect(auditPackage(index, ['missing.js']).outcome).toBe('ISSUES_FOUND');
  });
  test('many-reference reviewer package is rejected without accumulating findings', async () => {
    const index = await ingestArchive(tgzFixture(Array.from({ length: 30 }, (_, i) => ({
      path: `package/${i}.html`, content: '<img src=x>'.repeat(90000),
    }))));
    const result = auditPackage(index);
    expect(result.htmlFindings).toHaveLength(0);
    expect(result.htmlCoverageIssues).toHaveLength(30);
    expect(result.htmlCoverageIssues.every(issue => issue.code === 'HTML_COMPLEXITY_LIMIT')).toBe(true);
    expect(result.outcome).toBe('NOT_AUDITABLE');
  });
  test('depth and tag-length boundaries are inclusive', () => {
    expect(extractHtmlReferences('<div>'.repeat(256) + '</div>'.repeat(256))).toEqual([]);
    expect(() => extractHtmlReferences('<div>'.repeat(257)))
      .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
    const prefix = '<img src="';
    const suffix = '">';
    expect(extractHtmlReferences(prefix + 'x'.repeat(65536 - prefix.length - suffix.length) + suffix)).toHaveLength(1);
    expect(() => extractHtmlReferences(prefix + 'x'.repeat(65537 - prefix.length - suffix.length) + suffix))
      .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
  });
  test('archive path metadata reads stay linear across 10000 empty HTML files', () => {
    let reads = 0;
    const files = Array.from({ length: 10000 }, (_, i) => ({
      get path() { reads++; return `${i}.html`; }, size: 0, bytes: new Uint8Array(),
    }));
    const index: ArchiveIndex = { files, entryCount: 10000, decompressedBytes: 5120000 };
    const result = auditPackage(index);
    expect(result.htmlFilesScanned).toHaveLength(10000);
    expect(reads).toBeLessThanOrEqual(40000);
    expect(result.outcome).toBe('NOT_AUDITABLE');
  });
});
