import { ArchiveError } from './archive-model';
import type { ArchiveFile, ArchiveIndex } from './archive-model';
import { normalizePackagePath } from './archive-path';
import type { ArchiveLimits } from './limits';
import { BoundedStreamReader } from './stream-reader';

const BLOCK_SIZE = 512;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function textField(header: Uint8Array, offset: number, length: number): string {
  const bytes = header.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  if (end !== -1 && bytes.subarray(end).some(byte => byte !== 0)) {
    throw new ArchiveError('INVALID_TAR', 'TAR text field has data after its terminator.');
  }
  try {
    return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
  } catch {
    throw new ArchiveError('INVALID_TAR', 'TAR text field is not valid UTF-8.');
  }
}

function octalField(header: Uint8Array, offset: number, length: number, allowEmpty = false): number {
  const field = header.subarray(offset, offset + length);
  const end = field.indexOf(0);
  if (end !== -1 && field.subarray(end).some(byte => byte !== 0 && byte !== 32)) {
    throw new ArchiveError('INVALID_TAR', 'TAR numeric field has data after its terminator.');
  }
  const digits = end === -1 ? field : field.subarray(0, end);
  const text = Array.from(digits, byte => String.fromCharCode(byte)).join('').replace(/^ +| +$/gu, '');
  if (allowEmpty && text === '') return 0;
  if (!/^[0-7]+$/u.test(text)) {
    throw new ArchiveError('INVALID_TAR', 'TAR numeric field is not octal.');
  }
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) {
    throw new ArchiveError('INVALID_TAR', 'TAR numeric field exceeds the safe integer range.');
  }
  return value;
}

function parseHeader(header: Uint8Array) {
  const expectedChecksum = octalField(header, 148, 8);
  const actualChecksum = header.reduce((sum, byte, index) =>
    sum + (index >= 148 && index < 156 ? 32 : byte), 0);
  if (actualChecksum !== expectedChecksum) {
    throw new ArchiveError('INVALID_TAR', 'TAR header checksum does not match.');
  }
  if (textField(header, 257, 6) !== 'ustar' || textField(header, 263, 2) !== '00') {
    throw new ArchiveError('UNSUPPORTED_TAR', 'Only POSIX USTAR archives are supported.');
  }
  const type = header[156];
  if (type === 120 || type === 103) {
    throw new ArchiveError('UNSUPPORTED_TAR', 'PAX extended headers are unsupported (used for non-ASCII or long filenames).');
  }
  if (type !== 0 && type !== 48 && type !== 53) {
    throw new ArchiveError('UNSUPPORTED_TAR', 'Only regular files and directories are supported; links and extensions are rejected.');
  }
  const directory = type === 53;
  const size = octalField(header, 124, 12);
  for (const [offset, length] of [[100, 8], [108, 8], [116, 8], [136, 12], [329, 8], [337, 8]]) {
    octalField(header, offset, length, true);
  }
  if (textField(header, 157, 100) !== '' || (directory && size !== 0)) {
    throw new ArchiveError('INVALID_TAR', 'TAR entry has an unexpected link target or directory payload.');
  }
  const name = textField(header, 0, 100);
  const prefix = textField(header, 345, 155);
  if (!name || name.startsWith('/')) {
    throw new ArchiveError('UNSAFE_PATH', 'TAR entry name is empty or absolute.');
  }
  const path = normalizePackagePath(prefix ? `${prefix}/${name}` : name, directory);
  return { path, size, directory };
}

export async function readTar(stream: BoundedStreamReader, limits: ArchiveLimits): Promise<ArchiveIndex> {
  const files: ArchiveFile[] = [];
  const entries = new Map<string, boolean>();
  const directories = new Set<string>();
  let entryCount = 0;

  while (true) {
    const header = await stream.readExactly(BLOCK_SIZE);
    if (header.every(byte => byte === 0)) {
      const second = await stream.readExactly(BLOCK_SIZE);
      if (second.some(byte => byte !== 0)) {
        throw new ArchiveError('INVALID_TAR', 'TAR requires two zero end blocks.');
      }
      await stream.finishZeroTrailer();
      break;
    }
    if (++entryCount > limits.maxEntries) {
      throw new ArchiveError('LIMIT_EXCEEDED', 'Archive exceeds the entry limit.');
    }
    const { path, size, directory } = parseHeader(header);
    if (size > limits.maxFileBytes) {
      throw new ArchiveError('LIMIT_EXCEEDED', 'Archive entry exceeds the individual file limit.');
    }
    if (entries.has(path)) {
      throw new ArchiveError('DUPLICATE_PATH', 'Archive contains a duplicate normalized path.');
    }
    if (!directory && directories.has(path)) {
      throw new ArchiveError('PATH_CONFLICT', 'Archive file conflicts with a directory.');
    }
    const segments = path.split('/');
    for (let depth = 1; depth < segments.length; depth++) {
      const ancestor = segments.slice(0, depth).join('/');
      if (entries.get(ancestor) === false) {
        throw new ArchiveError('PATH_CONFLICT', 'Archive file is used as a parent directory.');
      }
      directories.add(ancestor);
    }
    entries.set(path, directory);
    if (directory) directories.add(path);
    const bytes = await stream.readExactly(size);
    const padding = await stream.readExactly((BLOCK_SIZE - size % BLOCK_SIZE) % BLOCK_SIZE);
    if (padding.some(byte => byte !== 0)) {
      throw new ArchiveError('INVALID_TAR', 'TAR payload padding is not zero.');
    }
    if (!directory) files.push(Object.freeze({ path, size, bytes }));
  }
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return Object.freeze({ files: Object.freeze(files), entryCount, decompressedBytes: stream.totalBytes });
}
