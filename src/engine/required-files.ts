import { ArchiveError } from './archive-model';
import type { ArchiveIndex } from './archive-model';
import { normalizePackagePath } from './archive-path';

export interface RequiredFileFinding {
  readonly path: string;
  readonly status: 'FOUND' | 'MISSING';
}

export class RequiredFilePolicyError extends Error {
  readonly code = 'INVALID_POLICY';

  constructor(message: string, public readonly entryIndex?: number) {
    super(message);
    this.name = 'RequiredFilePolicyError';
  }
}

/** Checks paths only. The index must come from successful archive ingestion. */
export function checkRequiredFiles(
  index: ArchiveIndex,
  requiredPaths: readonly string[],
): readonly RequiredFileFinding[] {
  if (!Array.isArray(requiredPaths)) {
    throw new RequiredFilePolicyError('Expected an array of required file paths.');
  }

  const paths = new Set<string>();
  for (const [entryIndex, rawPath] of requiredPaths.entries()) {
    // Check absolute paths before adding the archive-root adapter prefix.
    if (typeof rawPath !== 'string' || rawPath.startsWith('/')) {
      throw new RequiredFilePolicyError('Required file path is invalid or unsafe.', entryIndex);
    }
    try {
      paths.add(normalizePackagePath(`package/${rawPath}`, false));
    } catch (error) {
      if (!(error instanceof ArchiveError) || error.code !== 'UNSAFE_PATH') throw error;
      throw new RequiredFilePolicyError('Required file path is invalid or unsafe.', entryIndex);
    }
  }

  // Validate the entire policy before producing findings. Only regular files occur here.
  const files = new Set(index.files.map(file => file.path));
  return Object.freeze([...paths].sort().map(path => Object.freeze({
    path,
    status: files.has(path) ? 'FOUND' as const : 'MISSING' as const,
  })));
}
