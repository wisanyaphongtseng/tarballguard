import { afterEach, expect, test, vi } from 'vitest';
import * as parse5 from 'parse5';
import { extractHtmlReferences } from '../src/engine/html-references';
import { auditPackage } from '../src/engine/package-audit';
import { ingestArchive } from '../src/engine/archive';
import { tgzFixture } from './archive-fixture';

vi.mock('parse5', async importOriginal => {
  const actual = await importOriginal<typeof import('parse5')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});
afterEach(() => vi.restoreAllMocks());

test('rejects a small abrupt comment before parsing', () => {
  vi.mocked(parse5.parse).mockClear();
  expect(() => extractHtmlReferences('<!--><img src=x>-->'))
    .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
  expect(parse5.parse).not.toHaveBeenCalled();
});

const nested = '<div>'.repeat(40000) + '<img src=x>' + '</div>'.repeat(40000);
test.each([
  ['reviewer 40000 nesting', '<!-->' + nested + '-->'],
  ['abrupt dash ending', '<!--->' + nested + '-->'],
  ['bang recovery ending', '<!-- text --!>' + nested + '-->'],
  ['90000 nested tags', '<!-->' + '<div>'.repeat(90000) + '</div>'.repeat(90000) + '-->'],
  ['100000 attributes', '<!-->' + '<div ' + Array.from({ length: 100000 }, (_, i) => `a${i}=x`).join(' ') + '>-->'],
])('rejects %s before parse5', (name, html) => {
  vi.mocked(parse5.parse).mockClear();
  const start = performance.now();
  expect(() => extractHtmlReferences(html))
    .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT', message: expect.stringContaining('comment') }));
  expect(parse5.parse).not.toHaveBeenCalled();
  // Explicit reproduction measurements; never used as correctness thresholds.
  console.info(JSON.stringify({ probe: name, parseCalls: vi.mocked(parse5.parse).mock.calls.length,
    milliseconds: Number((performance.now() - start).toFixed(2)) }));
});

test.each([
  '<!-- comment -->', '<!-- small harmless text -->', '<!---->',
  '<!-- text > and - are harmless -->',
])('accepts ordinary comment %s and scans following markup', comment => {
  expect(extractHtmlReferences(comment + '<img src=real>')).toMatchObject([{ value: 'real' }]);
});

test('standard comments cannot hide subsequent pathological markup', () => {
  vi.mocked(parse5.parse).mockClear();
  expect(() => extractHtmlReferences('<!-- comment -->' + nested))
    .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
  expect(parse5.parse).not.toHaveBeenCalled();
});

test.each(['<!-- text -- text -->', '<!-- nested <!-- text -->', '<!-- unterminated', '<!-- text --!>',
  '<!-- <img src=fake> <div> text </div> -->'])
  ('conservatively rejects ambiguous comment %s', html => {
    vi.mocked(parse5.parse).mockClear();
    expect(() => extractHtmlReferences(html)).toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
    expect(parse5.parse).not.toHaveBeenCalled();
  });

test.each(['script', 'style', 'textarea', 'title'])('does not hide a %s end tag inside an apparent comment', tag => {
  vi.mocked(parse5.parse).mockClear();
  expect(() => extractHtmlReferences(`<${tag}><!-- text </${tag}>` + nested + '-->'))
    .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
  expect(parse5.parse).not.toHaveBeenCalled();
});

test.each([
  ['', [], 'NOT_AUDITABLE'],
  ['<img src=app.js>', [], 'CHECKED_WITH_UNKNOWNS'],
  ['<img src=missing.js>', [], 'ISSUES_FOUND'],
  ['', ['app.js'], 'CHECKED_WITH_UNKNOWNS'],
  ['', ['missing.js'], 'ISSUES_FOUND'],
] as const)('comment rejection preserves package outcome: %s %j %s', async (cleanHtml, required, outcome) => {
  const index = await ingestArchive(tgzFixture([
    { path: 'package/app.js' },
    { path: 'package/a.html', content: cleanHtml },
    { path: 'package/z.html', content: '<!-->' + nested + '-->' },
  ]));
  const result = auditPackage(index, required);
  expect(result.outcome).toBe(outcome);
  expect(result.htmlFilesScanned).toEqual(['a.html']);
  expect(result.htmlCoverageIssues).toMatchObject([
    { htmlPath: 'z.html', code: 'HTML_COMPLEXITY_LIMIT', reason: expect.stringContaining('comment') },
  ]);
  expect(result.htmlFindings.every(finding => finding.htmlPath === 'a.html')).toBe(true);
});
