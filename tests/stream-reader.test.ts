import { expect, test } from 'vitest';
import { DEFAULT_ARCHIVE_LIMITS } from '../src/engine/limits';
import { BoundedStreamReader } from '../src/engine/stream-reader';
import { readTar } from '../src/engine/tar';
import { tarFixture } from './archive-fixture';

test('reads headers and payloads across arbitrarily small stream chunks', async () => {
  const tar = tarFixture([{ path: 'package/a', content: 'fragmented payload' }]);
  let offset = 0;
  const source = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === tar.length) {
        controller.close();
      } else {
        controller.enqueue(tar.slice(offset, offset + 7));
        offset = Math.min(offset + 7, tar.length);
      }
    },
  });
  const reader = new BoundedStreamReader(source.getReader(), 4096);
  const result = await readTar(reader, DEFAULT_ARCHIVE_LIMITS);
  expect(result.files.map(file => file.path)).toEqual(['a']);
  expect(new TextDecoder().decode(result.files[0].bytes)).toBe('fragmented payload');
  expect(result.decompressedBytes).toBe(2048);
});

test('rejects a decompressor chunk beyond budget before retaining it', async () => {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1025));
      controller.close();
    },
  });
  const reader = new BoundedStreamReader(source.getReader(), 1024);
  await expect(reader.readExactly(512)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  expect(reader.totalBytes).toBe(0);
});
