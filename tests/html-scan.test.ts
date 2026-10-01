import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ingestArchive } from '../src/engine/archive';
import { extractHtmlReferences, MAX_HTML_BYTES } from '../src/engine/html-references';
import { scanHtmlFile, HtmlScanError } from '../src/engine/html-scan';
import { tgzFixture } from './archive-fixture';
import { missingReferenceEntries } from './html-scan-fixture';

describe('single HTML file asset scanning', () => {
  test('detects the core missing app.js failure from a deterministic ingested tarball', async () => {
    const input = Uint8Array.from(readFileSync(new URL('./fixtures/missing-reference.tgz', import.meta.url)));
    expect(input.buffer).toEqual(tgzFixture(missingReferenceEntries));
    const index = await ingestArchive(input.buffer);
    expect(index.files.map(file => file.path)).toEqual(['index.html', 'style.css']);
    const findings = scanHtmlFile(index, 'index.html');
    expect(findings).toEqual([
      {
        status: 'FOUND', htmlPath: 'index.html', targetPath: 'style.css',
        reference: { tag: 'link', attribute: 'href', value: './style.css', location: { line: 1, column: 7 } },
      },
      {
        status: 'MISSING', htmlPath: 'index.html', targetPath: 'app.js',
        reference: { tag: 'script', attribute: 'src', value: './app.js', location: { line: 2, column: 9 } },
      },
    ]);
    expect(scanHtmlFile(index, 'index.html')).toEqual(findings);
  });

  test.each([
    ['<script src="./app.js"></script>', 'app.js', 'script', 'src'],
    ['<link href="./style.css">', 'style.css', 'link', 'href'],
    ['<img src="./logo.svg">', 'logo.svg', 'img', 'src'],
  ])('finds a regular target for %s', async (html, target, tag, attribute) => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/dist/index.html', content: html }, { path: `package/dist/${target}` },
    ]));
    expect(scanHtmlFile(index, 'dist/index.html')).toMatchObject([
      { status: 'FOUND', htmlPath: 'dist/index.html', targetPath: `dist/${target}`,
        reference: { tag, attribute, value: `./${target}` } },
    ]);
  });

  test('preserves source order and duplicate elements across mixed findings', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/dist/index.html', content: '<img src=z.svg><script src=a.js></script><img src=z.svg>' },
      { path: 'package/dist/z.svg' },
    ]));
    expect(scanHtmlFile(index, 'dist/index.html').map(({ status, reference }) => ({ status, value: reference.value })))
      .toEqual([
        { status: 'FOUND', value: 'z.svg' }, { status: 'MISSING', value: 'a.js' },
        { status: 'FOUND', value: 'z.svg' },
      ]);
  });

  test('uses resolver query/fragment stripping while preserving extraction evidence and bytes', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/index.html', content: '<script src="./app.js?v=1#boot"></script>' },
      { path: 'package/app.js', content: 'throw new Error("never execute");' },
    ]));
    const file = index.files.find(file => file.path === 'index.html')!;
    const before = file.bytes.slice();
    const reference = extractHtmlReferences(file.bytes)[0];
    const findings = scanHtmlFile(index, 'index.html');
    expect(findings).toEqual([{ status: 'FOUND', htmlPath: 'index.html', targetPath: 'app.js', reference }]);
    expect(file.bytes).toEqual(before);
    expect(Object.isFrozen(findings)).toBe(true);
    expect(Object.isFrozen(findings[0])).toBe(true);
    expect(Object.isFrozen(findings[0].reference)).toBe(true);
    expect(Object.isFrozen(findings[0].reference.location)).toBe(true);
  });

  test('matches case and Unicode exactly but treats percent paths as unknown', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/index.html', content: '<img src="App.js"><img src="app.js">' +
        '<img src="café.svg"><img src="cafe\u0301.svg"><img src="hello%20world.js">' +
        '<img src="only%20space.js"><img src="%2e%2e/secret.js">' },
      { path: 'package/App.js' }, { path: 'package/café.svg' },
      { path: 'package/hello%20world.js' }, { path: 'package/only space.js' },
      { path: 'package/%2e%2e/secret.js' },
    ]));
    expect(scanHtmlFile(index, 'index.html').map(finding => finding.status))
      .toEqual(['FOUND', 'MISSING', 'FOUND', 'MISSING', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  });

  test.each([
    ['http://example.com/app.js', 'SKIPPED'], ['https://cdn.example.com/app.js', 'SKIPPED'],
    ['//cdn.example.com/app.js', 'SKIPPED'], ['data:image/png;base64,AAAA', 'SKIPPED'],
    ['/assets/app.js', 'UNKNOWN'], ['{{ asset }}', 'UNKNOWN'], ['', 'UNKNOWN'],
    ['../secret.js', 'UNKNOWN'], ['#section', 'SKIPPED'], ['?theme=dark', 'UNKNOWN'],
  ])('preserves %j as %s without target lookup findings', async (value, status) => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/index.html', content: `<script src="${value}"></script>` },
    ]));
    const [finding] = scanHtmlFile(index, 'index.html');
    expect(finding).toMatchObject({ status, htmlPath: 'index.html', reference: { value }, reason: expect.any(String) });
    expect(finding).not.toHaveProperty('targetPath');
  });

  test('a directory cannot satisfy a target and slash syntax keeps resolver semantics', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/index.html', content: '<img src="./assets"><img src="./assets/">' },
      { path: 'package/assets/', type: '5' },
    ]));
    expect(scanHtmlFile(index, 'index.html')).toMatchObject([
      { status: 'MISSING', targetPath: 'assets' }, { status: 'UNKNOWN', reason: expect.any(String) },
    ]);
  });

  test('HTML with no supported references returns an empty findings array', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/index.html', content: '<p>Hello</p>' }]));
    expect(scanHtmlFile(index, 'index.html')).toEqual([]);
  });

  test('accepts .htm and mixed-case HTML extensions without changing path matching', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/INDEX.HTM', content: '<img src=x>' }]));
    expect(scanHtmlFile(index, 'INDEX.HTM')).toMatchObject([{ status: 'MISSING', targetPath: 'x' }]);
    expect(() => scanHtmlFile(index, 'index.htm')).toThrow(HtmlScanError);
  });
});

describe('referring HTML validation', () => {
  test.each(['absent.html', 'assets.html', 'data.txt', './index.html', '../index.html', '/index.html', '', 'index.html/'])
    ('throws an explicit error for invalid referring file %j', async htmlPath => {
      const index = await ingestArchive(tgzFixture([
        { path: 'package/index.html', content: '<img src=x>' },
        { path: 'package/assets.html/', type: '5' },
        { path: 'package/data.txt', content: '<img src=x>' },
      ]));
      expect(() => scanHtmlFile(index, htmlPath)).toThrow(HtmlScanError);
      expect(() => scanHtmlFile(index, htmlPath)).toThrow(expect.objectContaining({ code: 'INVALID_HTML_FILE' }));
    });

  test('propagates the existing HTML cap rather than scanning oversize retained bytes', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/index.html', content: new Uint8Array(MAX_HTML_BYTES + 1) },
    ]));
    expect(() => scanHtmlFile(index, 'index.html')).toThrow(expect.objectContaining({ code: 'HTML_TOO_LARGE' }));
  });

  test('propagates invalid UTF-8 without returning partial findings', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/index.html', content: new Uint8Array([0xff]) }]));
    expect(() => scanHtmlFile(index, 'index.html')).toThrow(expect.objectContaining({ code: 'INVALID_UTF8' }));
  });
});
