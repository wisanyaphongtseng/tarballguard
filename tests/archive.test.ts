import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { ingestArchive } from '../src/engine/archive';
import { checksum, gzipFixture, tarFixture, tgzFixture, writeField } from './archive-fixture';

describe('archive input and deterministic indexing', () => {
  test('reads an actual npm pack artifact produced without lifecycle scripts', async () => {
    const buffer = Uint8Array.from(readFileSync(
      new URL('./fixtures/b08-archive-fixture-1.0.0.tgz', import.meta.url),
    )).buffer;
    const result = await ingestArchive(buffer);
    expect(result.files.map(file => file.path)).toEqual(['data.txt', 'package.json']);
    expect(new TextDecoder().decode(result.files[0].bytes).trimEnd()).toBe('Archive fixture data.');
    expect(JSON.parse(new TextDecoder().decode(result.files[1].bytes))).toMatchObject({
      name: 'b08-archive-fixture', version: '1.0.0',
    });
  });

  test('indexes regular files, strips package root, normalizes dots, and sorts paths', async () => {
    const result = await ingestArchive(tgzFixture([
      { path: 'package/', type: '5' },
      { path: 'package/dist/', type: '5' },
      { path: './package//dist/./z.js', content: 'throw new Error("never execute");' },
      { path: 'package/dist/a.txt', content: 'hello' },
      { path: 'package/empty' },
    ]));
    expect(result.files.map(({ path, size }) => ({ path, size }))).toEqual([
      { path: 'dist/a.txt', size: 5 },
      { path: 'dist/z.js', size: 33 },
      { path: 'empty', size: 0 },
    ]);
    expect(new TextDecoder().decode(result.files[0].bytes)).toBe('hello');
    expect(result.entryCount).toBe(5);
  });

  test('accepts File without depending on its name', async () => {
    const file = new File([tgzFixture([{ path: 'package/a', content: 'x' }])], 'anything.bin');
    const result = await ingestArchive(file);
    expect(result.files.map(file => file.path)).toEqual(['a']);
  });

  test('accepts USTAR prefix and NUL regular-file type', async () => {
    const result = await ingestArchive(tgzFixture([
      { path: 'logo.svg', prefix: 'package/dist/images', type: '\0', content: '<svg/>' },
    ]));
    expect(result.files[0].path).toBe('dist/images/logo.svg');
  });

  test('handles multiblock payloads without losing bytes', async () => {
    const content = Uint8Array.from({ length: 70000 }, (_, index) => index % 251);
    const result = await ingestArchive(tgzFixture([{ path: 'package/data', content }]));
    expect(result.files[0].bytes).toEqual(content);
  });

  test('preserves case without URL-decoding archive names', async () => {
    const result = await ingestArchive(tgzFixture([
      { path: 'package/A' }, { path: 'package/a' },
      { path: 'package/%2e%2e' }, { path: 'package/__proto__' },
    ]));
    expect(result.files.map(file => file.path)).toEqual(['%2e%2e', 'A', '__proto__', 'a']);
  });

  test('identifies unsupported extended headers in a real npm package with a Unicode filename', async () => {
    const buffer = Uint8Array.from(readFileSync(
      new URL('./fixtures/b08-unicode-archive-fixture-1.0.0.tgz', import.meta.url),
    )).buffer;
    await expect(ingestArchive(buffer)).rejects.toMatchObject({
      code: 'UNSUPPORTED_TAR',
      message: 'PAX extended headers are unsupported (used for non-ASCII or long filenames).',
    });
  });

  test('accepts an empty TAR without making an audit claim', async () => {
    expect((await ingestArchive(tgzFixture([]))).files).toEqual([]);
  });

  test('indexes identically regardless of TAR entry order', async () => {
    const entries = [{ path: 'package/b', content: 'b' }, { path: 'package/a', content: 'a' }];
    const first = await ingestArchive(tgzFixture(entries));
    const second = await ingestArchive(tgzFixture(entries.reverse()));
    expect(first).toEqual(second);
  });

  test('snapshots ArrayBuffer before asynchronous processing', async () => {
    const buffer = tgzFixture([{ path: 'package/a', content: 'original' }]);
    const pending = ingestArchive(buffer);
    new Uint8Array(buffer).fill(0);
    expect(new TextDecoder().decode((await pending).files[0].bytes)).toBe('original');
  });

  test('permits an explicit parent directory after its child file', async () => {
    const result = await ingestArchive(tgzFixture([
      { path: 'package/a/b' }, { path: 'package/a/', type: '5' },
    ]));
    expect(result.files.map(file => file.path)).toEqual(['a/b']);
  });
});

describe('unsafe paths and ambiguous entries', () => {
  test.each([
    '../outside', 'package/../outside', 'package/a/../../outside', 'package/a/../b',
    '/package/a', '//server/package/a', 'C:/package/a', 'package/C:/a',
    'package\\a', 'other/a', 'package/\nname', '', 'package',
  ])('rejects unsafe regular-file path %j', async path => {
    await expect(ingestArchive(tgzFixture([{ path }]))).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });

  test('rejects traversal in USTAR prefix', async () => {
    await expect(ingestArchive(tgzFixture([{ path: 'a', prefix: 'package/../outside' }])))
      .rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });

  test('rejects traversal in directory entries', async () => {
    await expect(ingestArchive(tgzFixture([{ path: 'package/../outside/', type: '5' }])))
      .rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });

  test('rejects an absolute name even when USTAR prefix is package-local', async () => {
    await expect(ingestArchive(tgzFixture([{ path: '/outside', prefix: 'package' }])))
      .rejects.toMatchObject({ code: 'UNSAFE_PATH' });
  });

  test.each(['package/a', './package//a'])('rejects duplicate canonical paths %s', async path => {
    await expect(ingestArchive(tgzFixture([{ path: 'package/a' }, { path }])))
      .rejects.toMatchObject({ code: 'DUPLICATE_PATH' });
  });

  test('rejects duplicate directories', async () => {
    await expect(ingestArchive(tgzFixture([
      { path: 'package/d/', type: '5' }, { path: 'package/d', type: '5' },
    ]))).rejects.toMatchObject({ code: 'DUPLICATE_PATH' });
  });

  test.each([false, true])('rejects file/ancestor conflict regardless of order %s', async reverse => {
    const entries = [{ path: 'package/a' }, { path: 'package/a/b' }];
    await expect(ingestArchive(tgzFixture(reverse ? entries.reverse() : entries)))
      .rejects.toMatchObject({ code: 'PATH_CONFLICT' });
  });

  test.each(['1', '2', '3', '4', '6', '7', 'x', 'g', 'L', 'K', 'S'])
    ('rejects unsupported entry type %s', async type => {
      await expect(ingestArchive(tgzFixture([{ path: 'package/a', type, linkname: '../outside' }])))
        .rejects.toMatchObject({ code: 'UNSUPPORTED_TAR' });
    });
});

describe('configurable bounds', () => {
  test('checks compressed limit for both input forms', async () => {
    const buffer = tgzFixture([{ path: 'package/a' }]);
    for (const input of [buffer, new File([buffer], 'a.tgz')]) {
      await expect(ingestArchive(input, { maxCompressedBytes: buffer.byteLength - 1 }))
        .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    }
    expect((await ingestArchive(buffer, { maxCompressedBytes: buffer.byteLength })).files).toHaveLength(1);
  });

  test('counts all decompressed bytes, including trailing zeros', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    await expect(ingestArchive(gzipFixture(tar), { maxDecompressedBytes: tar.length - 1 }))
      .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect((await ingestArchive(gzipFixture(tar), { maxDecompressedBytes: tar.length })).files).toHaveLength(1);
  });

  test('rejects highly compressible oversized output', async () => {
    await expect(ingestArchive(tgzFixture([
      { path: 'package/a', content: new Uint8Array(1024 * 1024) },
    ]), { maxDecompressedBytes: 4096, maxFileBytes: 2 * 1024 * 1024 }))
      .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  test('counts directories toward entry limit', async () => {
    await expect(ingestArchive(tgzFixture([
      { path: 'package/', type: '5' }, { path: 'package/a' },
    ]), { maxEntries: 1 })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  test('accepts exactly the entry limit', async () => {
    expect((await ingestArchive(tgzFixture([{ path: 'package/a' }]), { maxEntries: 1 })).entryCount).toBe(1);
  });

  test('checks individual size before trusting payload', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    writeField(tar, 124, 12, '77777777777');
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar), { maxFileBytes: 5 }))
      .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  test('allows exact file-size bound', async () => {
    expect((await ingestArchive(tgzFixture([{ path: 'package/a', content: 'hello' }]),
      { maxFileBytes: 5 })).files[0].size).toBe(5);
  });

  test('rejects a file one byte beyond the file-size bound', async () => {
    await expect(ingestArchive(tgzFixture([{ path: 'package/a', content: 'hello!' }]), { maxFileBytes: 5 }))
      .rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  test('rejects an explicit undefined limit instead of disabling its bound', async () => {
    await expect(ingestArchive(tgzFixture([]), { maxEntries: undefined }))
      .rejects.toMatchObject({ code: 'INVALID_LIMITS' });
  });

  test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    ('rejects invalid limits %s', async value => {
      await expect(ingestArchive(tgzFixture([]), { maxEntries: value }))
        .rejects.toMatchObject({ code: 'INVALID_LIMITS' });
    });

  test('rejects unknown limit keys even when inherited from Object.prototype', async () => {
    await expect(ingestArchive(tgzFixture([]), { toString: 1 } as never))
      .rejects.toMatchObject({ code: 'INVALID_LIMITS' });
  });
});

describe('malformed archives', () => {
  test.each(['NotReadableError', 'NotFoundError'])('distinguishes File read failure %s from corrupt gzip', async name => {
    const file = new File([tgzFixture([{ path: 'package/a' }])], 'fixture.tgz');
    const spy = vi.spyOn(file, 'stream').mockImplementation(() => new ReadableStream({
      start(controller) {
        controller.error(new DOMException('The source file cannot be read.', name));
      },
    }));
    try {
      await expect(ingestArchive(file)).rejects.toMatchObject({ code: 'READ_FAILED' });
    } finally {
      spy.mockRestore();
    }
  });

  test('rejects invalid input types at the public boundary', async () => {
    await expect(ingestArchive(new Uint8Array() as never)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  test('reports unsupported browser instead of falling back to an upload', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      await expect(ingestArchive(tgzFixture([]))).rejects.toMatchObject({ code: 'UNSUPPORTED_BROWSER' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test.each([new ArrayBuffer(0), new TextEncoder().encode('not gzip').buffer])
    ('rejects invalid gzip', async buffer => {
      await expect(ingestArchive(buffer)).rejects.toMatchObject({ code: 'INVALID_GZIP' });
    });

  test('rejects a corrupted gzip checksum even after valid TAR terminators', async () => {
    const buffer = tgzFixture([{ path: 'package/a' }]);
    const bytes = new Uint8Array(buffer);
    bytes[bytes.length - 8] ^= 1;
    await expect(ingestArchive(buffer)).rejects.toMatchObject({ code: 'INVALID_GZIP' });
  });

  test('rejects truncated gzip', async () => {
    const buffer = tgzFixture([{ path: 'package/a' }]);
    await expect(ingestArchive(buffer.slice(0, -4))).rejects.toMatchObject({ code: 'INVALID_GZIP' });
  });

  test('rejects corrupt TAR checksum', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    tar[0] ^= 1;
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test.each(['00000000008', '-0000000001', '000001x0000'])('rejects invalid size %s', async size => {
    const tar = tarFixture([{ path: 'package/a' }]);
    writeField(tar, 124, 12, size);
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects base-256 size encoding', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    tar[124] = 128;
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test.each([0, 32, 160])('rejects hidden digits or non-ASCII numeric whitespace %i', async byte => {
    const tar = tarFixture([{ path: 'package/a', content: 'x' }]);
    tar[124] = byte;
    if (byte === 32) tar[125] = 0;
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('allows ASCII-space padding and checksum space after NUL', async () => {
    const tar = tarFixture([{ path: 'package/a', content: 'x' }]);
    writeField(tar, 124, 12, '          1 ');
    checksum(tar.subarray(0, 512));
    const result = await ingestArchive(gzipFixture(tar));
    expect(result.files[0].size).toBe(1);
  });

  test.each([100, 600, 1024, 1536])('rejects truncated TAR at %i bytes', async length => {
    const tar = tarFixture([{ path: 'package/a', content: 'hello' }]);
    await expect(ingestArchive(gzipFixture(tar.slice(0, length))))
      .rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects entries after end markers', async () => {
    const first = tarFixture([{ path: 'package/a' }]);
    const second = tarFixture([{ path: 'package/b' }]);
    const combined = new Uint8Array(first.length + second.length);
    combined.set(first);
    combined.set(second, first.length);
    await expect(ingestArchive(gzipFixture(combined))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('accepts extra zero blocks but rejects unaligned trailers', async () => {
    const tar = tarFixture([]);
    const padded = new Uint8Array(tar.length + 512);
    padded.set(tar);
    expect((await ingestArchive(gzipFixture(padded))).files).toEqual([]);
    await expect(ingestArchive(gzipFixture(padded.slice(0, -1))))
      .rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects nonzero payload padding', async () => {
    const tar = tarFixture([{ path: 'package/a', content: 'x' }]);
    tar[513] = 1;
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects directory payload', async () => {
    await expect(ingestArchive(tgzFixture([{ path: 'package/d/', type: '5', content: 'x' }])))
      .rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects hidden path suffix after NUL', async () => {
    const tar = tarFixture([{ path: 'package/a\0../outside' }]);
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects invalid UTF-8 names', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    tar[8] = 255;
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'INVALID_TAR' });
  });

  test('rejects unsupported TAR format', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    writeField(tar, 257, 6, 'other');
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'UNSUPPORTED_TAR' });
  });

  test('rejects GNU magic explicitly', async () => {
    const tar = tarFixture([{ path: 'package/a' }]);
    writeField(tar, 257, 8, 'ustar  \0');
    checksum(tar.subarray(0, 512));
    await expect(ingestArchive(gzipFixture(tar))).rejects.toMatchObject({ code: 'UNSUPPORTED_TAR' });
  });

  test('rejects linkname on a regular file', async () => {
    await expect(ingestArchive(tgzFixture([{ path: 'package/a', linkname: 'package/b' }])))
      .rejects.toMatchObject({ code: 'INVALID_TAR' });
  });
});
