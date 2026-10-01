import { describe, expect, test } from 'vitest';
import { extractHtmlReferences } from '../src/engine/html-references';
import type { HtmlReference } from '../src/engine/html-references';
import { resolveHtmlReference } from '../src/engine/reference-resolution';

const reference = (value: string): HtmlReference => Object.freeze({
  tag: 'script', attribute: 'src', value,
  location: Object.freeze({ line: 2, column: 11 }),
});

describe('package-relative reference resolution', () => {
  test.each([
    ['./app.js', 'dist/pages/app.js'],
    ['../assets/logo.svg', 'dist/assets/logo.svg'],
    ['../../shared/app.js', 'shared/app.js'],
    ['style.css', 'dist/pages/style.css'],
    ['././assets/../app.js', 'dist/pages/app.js'],
    ['assets//images///logo.svg', 'dist/pages/assets/images/logo.svg'],
    ['./app.js?q=hello%20world#caf%C3%A9', 'dist/pages/app.js'],
    ['./app.js?v=123', 'dist/pages/app.js'],
    ['./app.js#boot', 'dist/pages/app.js'],
    ['./app.js?v=123#boot', 'dist/pages/app.js'],
    ['./app.js#boot?theme=dark', 'dist/pages/app.js'],
    ['./App.js', 'dist/pages/App.js'],
    ['./café.svg', 'dist/pages/café.svg'],
    ['./cafe\u0301.svg', 'dist/pages/cafe\u0301.svg'],
    ['./hello world.js', 'dist/pages/hello world.js'],
    ['./package/app.js', 'dist/pages/package/app.js'],
    ['./app.js?next=../outside#x', 'dist/pages/app.js'],
  ])('resolves %j to %j', (value, targetPath) => {
    const original = reference(value);
    expect(resolveHtmlReference('dist/pages/index.html', original))
      .toEqual({ status: 'RESOLVED', original, targetPath });
  });

  test('satisfies the dist/index.html acceptance example', () => {
    const original = reference('./app.js?v=1#boot');
    expect(resolveHtmlReference('dist/index.html', original))
      .toEqual({ status: 'RESOLVED', original, targetPath: 'dist/app.js' });
  });

  test('resolves root-level relative files without adding a package prefix', () => {
    expect(resolveHtmlReference('index.html', reference('app.js')))
      .toMatchObject({ status: 'RESOLVED', targetPath: 'app.js' });
  });

  test('preserves the original reference and location object unchanged', () => {
    const original = extractHtmlReferences('<img src="./a.svg?x=1&amp;y=2#v">')[0];
    const before = JSON.stringify(original);
    const result = resolveHtmlReference('dist/index.html', original);
    expect(result.original).toBe(original);
    expect(result.original.location).toBe(original.location);
    expect(JSON.stringify(original)).toBe(before);
    expect(result).toEqual({ status: 'RESOLVED', original, targetPath: 'dist/a.svg' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test.each([
    ['script', 'src'], ['link', 'href'], ['img', 'src'],
  ] as const)('resolves by value for %s/%s', (tag, attribute) => {
    expect(resolveHtmlReference('dist/index.html', { tag, attribute, value: 'app.js' }))
      .toMatchObject({ status: 'RESOLVED', targetPath: 'dist/app.js' });
  });
});

describe('conservative reference classification', () => {
  test.each([
    '#section', '#top', '#', 'https://cdn.example.com/app.js', 'http://example.com/app.js',
    'HTTPS://cdn.example.com/app.js', '//cdn.example.com/app.js',
    'data:image/png;base64,AAAA', 'javascript:void(0)', 'mailto:test@example.com',
    'tel:+123', 'blob:https://example.com/id', 'about:blank',
  ])('skips %j without implying package-local success', value => {
    const original = reference(value);
    const result = resolveHtmlReference('dist/index.html', original);
    expect(result).toMatchObject({ status: 'SKIPPED', original, reason: expect.any(String) });
    expect(result).not.toHaveProperty('targetPath');
    expect(result).not.toHaveProperty('status', 'FOUND');
    expect(Object.isFrozen(result)).toBe(true);
  });

  test.each([
    './hello%20world.js', './%2e%2e/secret.js', './%2F%5C%3A.js', 'bad%ZZ.js',
    '?theme=dark', '?', '/assets/app.js', '', '   ', ' app.js', 'app.js ',
    '{{ asset }}', '${asset}', '<%= asset %>', '@asset', 'assets/{{ name }}.js',
    'app.js?version=${version}', '.\\app.js', 'C:/file.js', 'foo:bar', './foo:bar',
    'file:///tmp/app.js', 'ftp://example.com/app.js', 'https:app.js', 'https://', '//',
    'app\n.js', 'app\t.js', 'app\0.js', 'app\u007f.js',
    '.', './', '..', '../', 'assets/', 'assets/.', 'assets/..',
    '../../../outside.js', '../../../dist/app.js',
  ])('classifies %j as UNKNOWN without a target', value => {
    const original = reference(value);
    const result = resolveHtmlReference('dist/pages/index.html', original);
    expect(result).toMatchObject({ status: 'UNKNOWN', original, reason: expect.any(String) });
    expect(result).not.toHaveProperty('targetPath');
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('never resolves traversal from the package root', () => {
    expect(resolveHtmlReference('index.html', reference('../secret.js')))
      .toMatchObject({ status: 'UNKNOWN', reason: expect.any(String) });
  });

  test.each([
    '../index.html', '/index.html', 'dist\\index.html', 'dist/index.html/', '',
    'dist/../index.html', './dist/index.html', 'dist//index.html', 'dist/a:b.html',
  ])('rejects unsafe or noncanonical referring path %j conservatively', htmlPath => {
    expect(resolveHtmlReference(htmlPath, reference('./app.js')))
      .toMatchObject({ status: 'UNKNOWN', reason: expect.any(String) });
  });
});
