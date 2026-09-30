import { ArchiveError } from './archive-model';

/** Archive names are POSIX paths, not URLs. Never percent-decode them. */
export function normalizePackagePath(rawPath: string, directory: boolean): string {
  if (!rawPath || rawPath.startsWith('/') || /[\\:\u0000-\u001f\u007f]/u.test(rawPath) ||
      (!directory && rawPath.endsWith('/'))) {
    throw new ArchiveError('UNSAFE_PATH', 'Archive path is unsafe.');
  }
  const segments = rawPath.split('/');
  // Reject traversal even when it would ultimately remain inside the package.
  if (segments.includes('..')) {
    throw new ArchiveError('UNSAFE_PATH', 'Archive path contains traversal.');
  }
  const normalized = segments.filter(segment => segment !== '' && segment !== '.');
  if (normalized.shift() !== 'package' || (!directory && normalized.length === 0)) {
    throw new ArchiveError('UNSAFE_PATH', 'Archive entry must be inside the package root.');
  }
  return normalized.join('/');
}
