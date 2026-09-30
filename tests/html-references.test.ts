import { afterEach, describe, expect, test, vi } from 'vitest';
import { extractHtmlReferences, HtmlExtractionError, MAX_HTML_BYTES } from '../src/engine/html-references';

afterEach(() => vi.unstubAllGlobals());

const evidence = (html: string | Uint8Array) => extractHtmlReferences(html)
  .map(({ tag, attribute, value }) => ({ tag, attribute, value }));

describe('HTML literal-reference extraction', () => {
  test('extracts exactly the three acceptance references in source order', () => {
    const html = `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="./style.css">
  </head>
  <body>
    <img src="./logo.svg">
    <script src="./app.js"></script>
  </body>
</html>`;
    expect(evidence(html)).toEqual([
      { tag: 'link', attribute: 'href', value: './style.css' },
      { tag: 'img', attribute: 'src', value: './logo.svg' },
      { tag: 'script', attribute: 'src', value: './app.js' },
    ]);
  });

  test.each([
    ['<script src="scripts/app.js"></script>', 'script', 'src', 'scripts/app.js'],
    ["<link href='./style.css'>", 'link', 'href', './style.css'],
    ['<img src=../images/logo.svg>', 'img', 'src', '../images/logo.svg'],
    ['<ScRiPt \n SrC = "./app.js" ></ScRiPt>', 'script', 'src', './app.js'],
    ['<LINK HREF=style.css>', 'link', 'href', 'style.css'],
    ['<IMG SRC=logo.svg>', 'img', 'src', 'logo.svg'],
  ])('handles HTML syntax %s', (html, tag, attribute, value) => {
    expect(evidence(html)).toEqual([{ tag, attribute, value }]);
  });

  test('extracts nested markup and retains separate duplicate elements', () => {
    expect(evidence('<main><section><img src="a.svg"><div><img src="a.svg"></div></section></main>'))
      .toEqual([
        { tag: 'img', attribute: 'src', value: 'a.svg' },
        { tag: 'img', attribute: 'src', value: 'a.svg' },
      ]);
  });

  test('recovers malformed but parseable markup', () => {
    expect(evidence('<div><p><img src=logo.svg><p><script src=app.js></script>')).toEqual([
      { tag: 'img', attribute: 'src', value: 'logo.svg' },
      { tag: 'script', attribute: 'src', value: 'app.js' },
    ]);
  });

  test('uses source order even when HTML tree correction reorders elements', () => {
    expect(evidence('<table><tr><td><img src=first.svg></td></tr><img src=second.svg></table>'))
      .toEqual([
        { tag: 'img', attribute: 'src', value: 'first.svg' },
        { tag: 'img', attribute: 'src', value: 'second.svg' },
      ]);
  });

  test('ignores missing target attributes and unsupported attributes/tags', () => {
    expect(evidence('<script></script><link rel=stylesheet><img alt=hi><a href=x>link</a>' +
      '<img srcset="a.svg 1x"><script data-src=x></script><link src=x>')).toEqual([]);
  });

  test('retains empty and valueless target attributes', () => {
    expect(evidence('<script src=""></script><link href><img src=\'\'>')).toEqual([
      { tag: 'script', attribute: 'src', value: '' },
      { tag: 'link', attribute: 'href', value: '' },
      { tag: 'img', attribute: 'src', value: '' },
    ]);
  });

  test.each([
    '/assets/app.js', 'https://cdn.example.com/app.js', '//cdn.example.com/app.js',
    '{{ asset }}', '${asset}', '../a/../app.js?raw=1#section', '%2e%2e/app.js', ' spaced.js ',
  ])('preserves literal value %j without classification or path normalization', value => {
    expect(evidence(`<script src="${value}"></script>`))
      .toEqual([{ tag: 'script', attribute: 'src', value }]);
  });

  test('decodes HTML character references once without URL decoding', () => {
    expect(evidence('<img src="a?x=1&amp;y=2&#35;part"><link href="&amp;amp;%2F&#x2f;">')).toEqual([
      { tag: 'img', attribute: 'src', value: 'a?x=1&y=2#part' },
      { tag: 'link', attribute: 'href', value: '&amp;%2F/' },
    ]);
  });

  test('uses the first duplicate target attribute under HTML parsing rules', () => {
    expect(evidence('<img src="first.svg" SRC="second.svg">'))
      .toEqual([{ tag: 'img', attribute: 'src', value: 'first.svg' }]);
  });

  test('ignores fake tags in scripts, styles, and text-only elements', () => {
    expect(evidence('<script>const fake = \'<script src="fake.js">\';</script>' +
      '<style>/* <link href="fake.css"> */</style>' +
      '<textarea><img src="text.svg"></textarea><title><img src="title.svg"></title>'))
      .toEqual([]);
  });

  test('includes literal HTML template content without evaluating templates', () => {
    expect(evidence('<template><img src="{{ asset }}"></template>'))
      .toEqual([{ tag: 'img', attribute: 'src', value: '{{ asset }}' }]);
  });

  test('uses scripting-enabled noscript parsing and ignores foreign SVG script elements', () => {
    expect(evidence('<noscript><img src="fallback.svg"></noscript>' +
      '<svg><script src="svg.js"></script></svg>')).toEqual([]);
  });

  test('returns one-based locations at the target attribute name', () => {
    const result = extractHtmlReferences('<!doctype html>\r\n<img\r\n  SRC="logo.svg">');
    expect(result).toEqual([
      { tag: 'img', attribute: 'src', value: 'logo.svg', location: { line: 3, column: 3 } },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0].location)).toBe(true);
  });

  test('decodes UTF-8 bytes and ignores an initial byte-order mark', () => {
    expect(evidence(new TextEncoder().encode('\ufeff<img src="café.svg">')))
      .toEqual([{ tag: 'img', attribute: 'src', value: 'café.svg' }]);
  });

  test('empty HTML produces no references or audit result', () => {
    expect(extractHtmlReferences('')).toEqual([]);
    expect(extractHtmlReferences(new Uint8Array())).toEqual([]);
  });
});

describe('bounded and inert HTML parsing', () => {
  test('accepts the exact byte cap and rejects one byte past it for strings and bytes', () => {
    const html = '<!--' + 'x'.repeat(MAX_HTML_BYTES - 7) + '-->';
    expect(extractHtmlReferences(html)).toEqual([]);
    expect(extractHtmlReferences(new TextEncoder().encode(html))).toEqual([]);
    for (const input of [html + 'x', new TextEncoder().encode(html + 'x')]) {
      expect(() => extractHtmlReferences(input)).toThrow(HtmlExtractionError);
      expect(() => extractHtmlReferences(input)).toThrow(expect.objectContaining({ code: 'HTML_TOO_LARGE' }));
    }
  });

  test('counts UTF-8 bytes rather than string characters', () => {
    const html = 'é'.repeat(MAX_HTML_BYTES / 2 + 1);
    expect(() => extractHtmlReferences(html)).toThrow(expect.objectContaining({ code: 'HTML_TOO_LARGE' }));
  });

  test('rejects invalid UTF-8 instead of silently replacing it', () => {
    expect(() => extractHtmlReferences(new Uint8Array([0xff])))
      .toThrow(expect.objectContaining({ code: 'INVALID_UTF8' }));
  });

  test.each([null, undefined, 42, {}, new ArrayBuffer(0)])('rejects invalid input %j', input => {
    expect(() => extractHtmlReferences(input as unknown as string))
      .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  test('rejects deep markup under the conservative structural-depth limit', () => {
    expect(() => evidence('<div>'.repeat(5000) + '<img src="deep.svg">' + '</div>'.repeat(5000)))
      .toThrow(expect.objectContaining({ code: 'HTML_COMPLEXITY_LIMIT' }));
  });

  test('never executes scripts, fetches resources, or accesses browser DOM APIs', () => {
    const forbidden = vi.fn(() => { throw new Error('Browser side effect'); });
    vi.stubGlobal('fetch', forbidden);
    vi.stubGlobal('XMLHttpRequest', forbidden);
    vi.stubGlobal('Image', forbidden);
    vi.stubGlobal('DOMParser', forbidden);
    vi.stubGlobal('document', new Proxy({}, { get: forbidden }));
    vi.stubGlobal('__b08HtmlExecuted', false);
    const html = '<script>globalThis.__b08HtmlExecuted = true; fetch("https://example.com");' +
      'document.body.innerHTML = "package markup";</script>' +
      '<script src="https://example.com/app.js"></script>' +
      '<link href="https://example.com/style.css"><img src="https://example.com/logo.svg" onerror="throw 1">';
    expect(evidence(html)).toEqual([
      { tag: 'script', attribute: 'src', value: 'https://example.com/app.js' },
      { tag: 'link', attribute: 'href', value: 'https://example.com/style.css' },
      { tag: 'img', attribute: 'src', value: 'https://example.com/logo.svg' },
    ]);
    expect((globalThis as unknown as { __b08HtmlExecuted: boolean }).__b08HtmlExecuted).toBe(false);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
