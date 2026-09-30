import type { ArchiveIndex } from './archive-model';
import type { HtmlReference } from './html-references';
import { createHtmlScanContext, scanHtmlFileInContext } from './html-scan-internal';

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

/** Shared filename eligibility; exact indexed membership is checked separately. */
export function isSupportedHtmlPath(path: string): boolean {
  return typeof path === 'string' && /\.html?$/iu.test(path);
}

/** Scans one retained HTML file. The index must come from successful ingestion. */
export function scanHtmlFile(index: ArchiveIndex, htmlPath: string): readonly HtmlAssetFinding[] {
  return scanHtmlFileInContext(createHtmlScanContext(index), htmlPath);
}
