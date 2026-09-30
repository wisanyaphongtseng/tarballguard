import { ArchiveError } from './archive-model';

export interface ArchiveLimits {
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxFileBytes: number;
  maxEntries: number;
}

export const DEFAULT_ARCHIVE_LIMITS: Readonly<ArchiveLimits> = Object.freeze({
  maxCompressedBytes: 20 * 1024 * 1024,
  maxDecompressedBytes: 100 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxEntries: 10000,
});

export function resolveLimits(overrides: Partial<ArchiveLimits>): ArchiveLimits {
  const limits = { ...DEFAULT_ARCHIVE_LIMITS, ...overrides };
  if (Object.keys(limits).some(key => !Object.hasOwn(DEFAULT_ARCHIVE_LIMITS, key)) ||
      Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new ArchiveError('INVALID_LIMITS', 'Archive limits must be positive safe integers with known keys.');
  }
  return limits;
}
