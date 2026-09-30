import type { ArchiveIndex } from './archive-model';
import { HtmlExtractionError } from './html-references';
import { isSupportedHtmlPath, scanHtmlFile } from './html-scan';
import type { HtmlAssetFinding } from './html-scan';
import { checkRequiredFiles } from './required-files';
import type { RequiredFileFinding } from './required-files';

export type AuditOutcome =
  | 'ISSUES_FOUND' | 'CHECKED_NO_ISSUES' | 'CHECKED_WITH_UNKNOWNS' | 'NOT_AUDITABLE';

export interface HtmlCoverageIssue {
  readonly htmlPath: string;
  readonly code: 'HTML_TOO_LARGE' | 'INVALID_UTF8';
  readonly reason: string;
}

export interface AuditSummary {
  readonly found: number;
  readonly missing: number;
  readonly unknown: number;
  readonly skipped: number;
  readonly checkedAssertions: number;
  readonly htmlFilesDiscovered: number;
  readonly htmlFilesScanned: number;
  readonly htmlFilesNotScanned: number;
}

export interface PackageAudit {
  readonly outcome: AuditOutcome;
  readonly requiredFileFindings: readonly RequiredFileFinding[];
  readonly htmlFindings: readonly HtmlAssetFinding[];
  readonly htmlFilesScanned: readonly string[];
  readonly htmlCoverageIssues: readonly HtmlCoverageIssue[];
  readonly summary: AuditSummary;
}

/** Reports performed checks and coverage, never runtime correctness. */
export function auditPackage(index: ArchiveIndex, requiredPaths: readonly string[] = []): PackageAudit {
  // Policy errors must propagate before any HTML work or partial result.
  const requiredFileFindings = checkRequiredFiles(index, requiredPaths);
  const htmlPaths = index.files.map(file => file.path).filter(isSupportedHtmlPath).sort();
  const htmlFindings: HtmlAssetFinding[] = [];
  const htmlFilesScanned: string[] = [];
  const htmlCoverageIssues: HtmlCoverageIssue[] = [];
  for (const htmlPath of htmlPaths) {
    try {
      const findings = scanHtmlFile(index, htmlPath);
      for (const finding of findings) htmlFindings.push(finding);
      htmlFilesScanned.push(htmlPath);
    } catch (error) {
      if (!(error instanceof HtmlExtractionError) ||
          (error.code !== 'HTML_TOO_LARGE' && error.code !== 'INVALID_UTF8')) throw error;
      htmlCoverageIssues.push(Object.freeze({ htmlPath, code: error.code, reason: error.message }));
    }
  }

  const counts = { FOUND: 0, MISSING: 0, UNKNOWN: 0, SKIPPED: 0 };
  for (const finding of requiredFileFindings) counts[finding.status]++;
  for (const finding of htmlFindings) counts[finding.status]++;
  const summary = Object.freeze({
    found: counts.FOUND, missing: counts.MISSING, unknown: counts.UNKNOWN, skipped: counts.SKIPPED,
    checkedAssertions: counts.FOUND + counts.MISSING,
    htmlFilesDiscovered: htmlPaths.length, htmlFilesScanned: htmlFilesScanned.length,
    htmlFilesNotScanned: htmlCoverageIssues.length,
  });
  const outcome: AuditOutcome = summary.missing > 0 ? 'ISSUES_FOUND'
    : summary.checkedAssertions === 0 ? 'NOT_AUDITABLE'
    : summary.unknown > 0 || htmlCoverageIssues.length > 0 ? 'CHECKED_WITH_UNKNOWNS'
    : 'CHECKED_NO_ISSUES';
  return Object.freeze({
    outcome, requiredFileFindings, htmlFindings: Object.freeze(htmlFindings),
    htmlFilesScanned: Object.freeze(htmlFilesScanned), htmlCoverageIssues: Object.freeze(htmlCoverageIssues), summary,
  });
}
