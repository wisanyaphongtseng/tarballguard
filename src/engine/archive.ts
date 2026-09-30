import { ArchiveError } from './archive-model';
import type { ArchiveIndex } from './archive-model';
import { resolveLimits } from './limits';
import type { ArchiveLimits } from './limits';
import { BoundedStreamReader } from './stream-reader';
import { readTar } from './tar';

export { ArchiveError } from './archive-model';
export type { ArchiveFile, ArchiveIndex } from './archive-model';
export { DEFAULT_ARCHIVE_LIMITS } from './limits';
export type { ArchiveLimits } from './limits';

/** Local-only ingestion. Returns no partial index when any entry is unsafe. */
export async function ingestArchive(
  input: ArrayBuffer | File,
  overrides: Partial<ArchiveLimits> = {},
): Promise<ArchiveIndex> {
  const limits = resolveLimits(overrides);
  const isBuffer = input instanceof ArrayBuffer;
  if (!isBuffer && !(typeof File !== 'undefined' && input instanceof File)) {
    throw new ArchiveError('INVALID_INPUT', 'Expected an ArrayBuffer or File.');
  }
  const compressedBytes = isBuffer ? input.byteLength : input.size;
  if (compressedBytes > limits.maxCompressedBytes) {
    throw new ArchiveError('LIMIT_EXCEEDED', 'Compressed archive exceeds the byte limit.');
  }
  if (compressedBytes === 0) {
    throw new ArchiveError('INVALID_GZIP', 'Gzip input is empty.');
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new ArchiveError('UNSUPPORTED_BROWSER', 'This browser does not support gzip decompression streams.');
  }
  // Blob snapshots ArrayBuffer input; File is already immutable and streamed.
  const source = isBuffer ? new Blob([input]) : input;
  const reader = source.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  try {
    return await readTar(new BoundedStreamReader(reader, limits.maxDecompressedBytes), limits);
  } finally {
    // Stop decompression after an early rejection. Cleanup must not mask its cause.
    try { await reader.cancel(); } catch { /* The stream may already be errored. */ }
    reader.releaseLock();
  }
}
