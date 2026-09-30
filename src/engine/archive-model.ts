export type ArchiveErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_LIMITS'
  | 'LIMIT_EXCEEDED'
  | 'INVALID_GZIP'
  | 'READ_FAILED'
  | 'INVALID_TAR'
  | 'UNSUPPORTED_TAR'
  | 'UNSUPPORTED_BROWSER'
  | 'UNSAFE_PATH'
  | 'DUPLICATE_PATH'
  | 'PATH_CONFLICT';

export class ArchiveError extends Error {
  constructor(public readonly code: ArchiveErrorCode, message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export interface ArchiveFile {
  readonly path: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}

export interface ArchiveIndex {
  readonly files: readonly ArchiveFile[];
  readonly entryCount: number;
  readonly decompressedBytes: number;
}
