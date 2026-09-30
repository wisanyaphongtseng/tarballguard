import type { ArchiveIndex } from './archive-model';
import type { HtmlReference } from './html-references';
import { extractHtmlReferences } from './html-references';
import { resolveHtmlReference } from './reference-resolution';

export type HtmlAssetFinding =
  | { readonly status: 'FOUND' | 'MISSING'; readonly htmlPath: string; readonly reference: HtmlReference; readonly targetPath: string }
  | { readonly status: 'UNKNOWN' | 'SKIPPED'; readonly htmlPath: string; readonly reference: HtmlReference; readonly reason: string };

export class HtmlScanError extends Error {
  readonly code = 'INVALID_HTML_FILE';

  constructor() {
    super('Expected an indexed regular HTML file with a .html or .htm extension.');
    this.name = 'HtmlScanError';
  }
}

/** Scans one retained HTML file. The index must come from successful ingestion. */
export function scanHtmlFile(index: ArchiveIndex, htmlPath: string): readonly HtmlAssetFinding[] {
  if (typeof htmlPath !== 'string' || !/\.html?$/iu.test(htmlPath)) throw new HtmlScanError();
  const htmlFile = index.files.find(file => file.path === htmlPath);
  if (!htmlFile) throw new HtmlScanError();

  const references = extractHtmlReferences(htmlFile.bytes);
  const paths = new Set(index.files.map(file => file.path));
  return Object.freeze(references.map((reference): HtmlAssetFinding => {
    const resolved = resolveHtmlReference(htmlPath, reference);
    if (resolved.status === 'RESOLVED') {
      return Object.freeze({
        status: paths.has(resolved.targetPath) ? 'FOUND' : 'MISSING',
        htmlPath, reference, targetPath: resolved.targetPath,
      });
    }
    return Object.freeze({ status: resolved.status, htmlPath, reference, reason: resolved.reason });
  }));
}
