import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ingestArchive } from '../src/engine/archive';
import type { ArchiveIndex } from '../src/engine/archive';
import { checkRequiredFiles, RequiredFilePolicyError } from '../src/engine/required-files';
import { tgzFixture } from './archive-fixture';
import { missingRequiredFileEntries } from './required-file-fixture';

describe('required-file checking', () => {
  test('reports existing regular files, including nested and empty files, as FOUND', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/dist/app.js', content: 'never execute this' },
      { path: 'package/dist/images/logo.svg' },
    ]));
    expect(checkRequiredFiles(index, ['dist/app.js', 'dist/images/logo.svg'])).toEqual([
      { path: 'dist/app.js', status: 'FOUND' },
      { path: 'dist/images/logo.svg', status: 'FOUND' },
    ]);
  });

  test('reports missing dist/index.html as MISSING from a checked-in ingested fixture', async () => {
    const bytes = Uint8Array.from(readFileSync(
      new URL('./fixtures/missing-required-file.tgz', import.meta.url),
    ));
    expect(bytes.buffer).toEqual(tgzFixture(missingRequiredFileEntries));
    const index = await ingestArchive(bytes.buffer);
    expect(index.files.map(file => file.path)).toEqual(['lib/index.js', 'package.json']);
    expect(checkRequiredFiles(index, ['dist/index.html'])).toEqual([
      { path: 'dist/index.html', status: 'MISSING' },
    ]);
  });

  test('checks an actual npm artifact without reading its TAR again', async () => {
    const bytes = Uint8Array.from(readFileSync(
      new URL('./fixtures/b08-archive-fixture-1.0.0.tgz', import.meta.url),
    ));
    const index = await ingestArchive(bytes.buffer);
    bytes.fill(0);
    expect(checkRequiredFiles(index, ['data.txt', 'dist/index.html'])).toEqual([
      { path: 'data.txt', status: 'FOUND' },
      { path: 'dist/index.html', status: 'MISSING' },
    ]);
  });

  test('explicit and implicit directories cannot satisfy a required file', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/dist/', type: '5' },
      { path: 'package/lib/index.js' },
    ]));
    expect(checkRequiredFiles(index, ['dist', 'lib'])).toEqual([
      { path: 'dist', status: 'MISSING' },
      { path: 'lib', status: 'MISSING' },
    ]);
  });

  test('normalizes dots and repeated separators before deduplicating and sorting', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/dist/app.js' }]));
    expect(checkRequiredFiles(index, [
      'z.js', './dist//./app.js', 'dist/app.js', 'z.js', 'a.js',
    ])).toEqual([
      { path: 'a.js', status: 'MISSING' },
      { path: 'dist/app.js', status: 'FOUND' },
      { path: 'z.js', status: 'MISSING' },
    ]);
  });

  test('produces identical findings for different policy orderings', async () => {
    const index = await ingestArchive(tgzFixture([]));
    const paths = ['z.js', 'a.js', './a.js'];
    expect(checkRequiredFiles(index, paths)).toEqual(checkRequiredFiles(index, [...paths].reverse()));
    expect(paths).toEqual(['z.js', 'a.js', './a.js']);
  });

  test('empty policy produces no findings and no pass claim', async () => {
    const index = await ingestArchive(tgzFixture([]));
    expect(checkRequiredFiles(index, [])).toEqual([]);
  });

  test('matches case exactly', async () => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/dist/App.js' }]));
    expect(checkRequiredFiles(index, ['dist/App.js', 'dist/app.js'])).toEqual([
      { path: 'dist/App.js', status: 'FOUND' },
      { path: 'dist/app.js', status: 'MISSING' },
    ]);
  });

  test('does not strip a package directory from required paths', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/app.js' }, { path: 'package/package/nested.js' },
    ]));
    expect(checkRequiredFiles(index, ['package/app.js', 'package/nested.js'])).toEqual([
      { path: 'package/app.js', status: 'MISSING' },
      { path: 'package/nested.js', status: 'FOUND' },
    ]);
  });

  test('preserves whitespace, percent escapes, Unicode form, and URL punctuation as filename text', async () => {
    const index = await ingestArchive(tgzFixture([
      { path: 'package/ spaced ' }, { path: 'package/%2e%2e/name' },
      { path: 'package/é.js' }, { path: 'package/app.js?raw#v1' },
    ]));
    expect(checkRequiredFiles(index, [
      ' spaced ', 'spaced', '%2e%2e/name', 'é.js', 'e\u0301.js', 'app.js?raw#v1', 'app.js',
    ])).toEqual([
      { path: ' spaced ', status: 'FOUND' },
      { path: '%2e%2e/name', status: 'FOUND' },
      { path: 'app.js', status: 'MISSING' },
      { path: 'app.js?raw#v1', status: 'FOUND' },
      { path: 'e\u0301.js', status: 'MISSING' },
      { path: 'spaced', status: 'MISSING' },
      { path: 'é.js', status: 'FOUND' },
    ]);
  });

  test('returns only frozen path/status findings without accessing file contents', () => {
    const index: ArchiveIndex = {
      files: [{
        path: 'secret.txt', size: 10,
        get bytes(): Uint8Array { throw new Error('Contents must not be read'); },
      }],
      entryCount: 1, decompressedBytes: 2048,
    };
    const result = checkRequiredFiles(index, ['secret.txt']);
    expect(result).toEqual([{ path: 'secret.txt', status: 'FOUND' }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });
});

describe('invalid required-file policy', () => {
  test.each([
    '../outside', 'dist/../app.js', 'dist/../../outside', '/dist/app.js', '//server/app.js',
    'C:/dist/app.js', 'dist\\app.js', 'dist/a:b.css', 'dist/\nfile', 'dist/\0file',
    'dist/\u007ffile', '', '.', './', 'dist/', 'dist/app.js/',
  ])('rejects %j as INVALID_POLICY rather than a missing finding', async path => {
    const index = await ingestArchive(tgzFixture([{ path: 'package/dist/app.js' }]));
    expect(() => checkRequiredFiles(index, ['dist/app.js', path])).toThrow(RequiredFilePolicyError);
    try {
      checkRequiredFiles(index, ['dist/app.js', path]);
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_POLICY', entryIndex: 1 });
    }
  });

  test.each([null, undefined, 'dist/app.js', {}])('rejects a non-array policy %j', async policy => {
    const index = await ingestArchive(tgzFixture([]));
    expect(() => checkRequiredFiles(index, policy as unknown as readonly string[]))
      .toThrow(RequiredFilePolicyError);
  });

  test.each([null, undefined, 42, {}])('rejects a non-string policy entry %j', async path => {
    const index = await ingestArchive(tgzFixture([]));
    expect(() => checkRequiredFiles(index, [path as unknown as string]))
      .toThrow(RequiredFilePolicyError);
  });
});
