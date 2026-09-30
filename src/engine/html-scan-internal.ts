import type { ArchiveFile, ArchiveIndex } from './archive-model';
import { extractHtmlReferences } from './html-references';
import { HtmlScanError, isSupportedHtmlPath } from './html-scan';
import type { HtmlAssetFinding } from './html-scan';
import { resolveHtmlReference } from './reference-resolution';

/** Internal per-audit view; never exposed in public results or cached across calls. */
export function createHtmlScanContext(index: ArchiveIndex): ReadonlyMap<string, ArchiveFile> {
  const files = new Map<string, ArchiveFile>();
  for (const file of index.files) files.set(file.path, file);
  return files;
}

export function scanHtmlFileInContext(
  files: ReadonlyMap<string, ArchiveFile>, htmlPath: string,
): readonly HtmlAssetFinding[] {
  if (!isSupportedHtmlPath(htmlPath)) throw new HtmlScanError();
  const htmlFile = files.get(htmlPath);
  if (!htmlFile) throw new HtmlScanError();
  return Object.freeze(extractHtmlReferences(htmlFile.bytes).map((reference): HtmlAssetFinding => {
    const resolved = resolveHtmlReference(htmlPath, reference);
    if (resolved.status === 'RESOLVED') {
      return Object.freeze({ status: files.has(resolved.targetPath) ? 'FOUND' : 'MISSING',
        htmlPath, reference, targetPath: resolved.targetPath });
    }
    return Object.freeze({ status: resolved.status, htmlPath, reference, reason: resolved.reason });
  }));
}
