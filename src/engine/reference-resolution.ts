import type { HtmlReference } from './html-references';
import { ArchiveError } from './archive-model';
import { normalizePackagePath } from './archive-path';

export type ResolvedReference =
  | { readonly status: 'RESOLVED'; readonly original: HtmlReference; readonly targetPath: string }
  | { readonly status: 'UNKNOWN' | 'SKIPPED'; readonly original: HtmlReference; readonly reason: string };

export function resolveHtmlReference(
  htmlPath: string,
  original: HtmlReference,
): ResolvedReference {
  const unknown = (reason: string): ResolvedReference => Object.freeze({ status: 'UNKNOWN', original, reason });
  const skipped = (reason: string): ResolvedReference => Object.freeze({ status: 'SKIPPED', original, reason });
  if (typeof htmlPath !== 'string' || htmlPath.startsWith('/')) {
    return unknown('Referring HTML path must be a safe canonical package-relative file path.');
  }
  try {
    if (normalizePackagePath(`package/${htmlPath}`, false) !== htmlPath) {
      return unknown('Referring HTML path must be canonical.');
    }
  } catch (error) {
    if (!(error instanceof ArchiveError) || error.code !== 'UNSAFE_PATH') throw error;
    return unknown('Referring HTML path is unsafe.');
  }

  const value = original.value;
  if (!value || value.trim() !== value) return unknown('Empty or surrounding-whitespace reference is ambiguous.');
  if (/[\\\u0000-\u001f\u007f]/u.test(value)) return unknown('Backslashes or control characters are unsupported.');
  if (/\{\{|\$\{|<%/u.test(value) || value.startsWith('@')) return unknown('Unresolved template syntax.');
  if (value.startsWith('#')) return skipped('Fragment-only reference does not identify another package file.');
  if (value.startsWith('?')) return unknown('Query-only reference depends on document semantics.');
  if (/^(?:https?:)?\/\/[^/?#\s]+/iu.test(value)) return skipped('External network URL.');
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(value)?.[1].toLowerCase();
  if (scheme && ['data', 'javascript', 'mailto', 'tel', 'blob', 'about'].includes(scheme)) {
    return skipped('Non-package URL scheme.');
  }
  if (scheme) return unknown('Unsupported scheme or drive-path ambiguity.');
  if (value.startsWith('/')) return unknown('Web-root-relative URL cannot be mapped to the package root.');

  const path = value.split(/[?#]/u, 1)[0];
  if (path.includes(':')) return unknown('Colon-containing paths are unsupported.');
  const segments = path.split('/');
  if (['', '.', '..'].includes(segments[segments.length - 1])) {
    return unknown('Directory-like reference depends on runtime index or routing semantics.');
  }
  const target = htmlPath.split('/').slice(0, -1);
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (target.length === 0) return unknown('Reference traverses outside the package root.');
      target.pop();
    } else {
      target.push(segment);
    }
  }
  // Reuse ingestion rules only after reference-specific dot-segment resolution.
  const targetPath = normalizePackagePath(`package/${target.join('/')}`, false);
  return Object.freeze({ status: 'RESOLVED', original, targetPath });
}
