import { useState } from 'react';
import type { ReactNode } from 'react';
import type { PackageAudit } from '../engine/package-audit';
import type { HtmlAssetFinding } from '../engine/html-scan';
import type { RequiredFileFinding } from '../engine/required-files';
import { visibleFileName as visibleText } from './file-display';

export const REPORT_BATCH_SIZE = 50;
const outcomeCopy = {
  ISSUES_FOUND: 'Missing packed files were found.',
  CHECKED_NO_ISSUES: 'No issues found in the checks that were performed.',
  CHECKED_WITH_UNKNOWNS: 'No definite missing file was found, but some references or files could not be fully checked.',
  NOT_AUDITABLE: 'B08 could not perform a package-local check with the current rules.',
};
const text = (value: unknown) => typeof value === 'string' ? visibleText(value) : 'Unavailable';
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  ? String(value) : 'Unavailable';

function ReportList<T>({ items, label, render }: {
  items: readonly T[]; label: string; render: (item: T) => ReactNode;
}) {
  const [limit, setLimit] = useState(REPORT_BATCH_SIZE);
  const shown = Math.min(limit, items.length);
  return <>
    <ul className="report-list">{items.slice(0, limit).map((item, index) => <li key={index}>{render(item)}</li>)}</ul>
    {items.length > REPORT_BATCH_SIZE && <div className="report-pagination">
      <p>Showing {shown} of {items.length}</p>
      {shown < items.length && <button type="button" onClick={() => setLimit(limit + REPORT_BATCH_SIZE)}>
        Show next {Math.min(REPORT_BATCH_SIZE, items.length - shown)} {label}
      </button>}
    </div>}
  </>;
}

function ReferenceEvidence({ finding }: { finding: HtmlAssetFinding }) {
  const location = finding.reference.location;
  const hasLocation = location && Number.isSafeInteger(location.line) && location.line > 0 &&
    Number.isSafeInteger(location.column) && location.column > 0;
  // Diagnostic syntax uses parser-decoded values, not raw HTML source spelling.
  const syntax = `<${text(finding.reference.tag)} ${text(finding.reference.attribute)}="${text(finding.reference.value)}">`;
  return <>
    <p className="evidence-source">HTML source: <code>{text(finding.htmlPath)}
      {hasLocation ? `:${location.line}:${location.column}` : ''}</code></p>
    <p className="field-label">Literal reference</p>
    <code className="report-code">{syntax}</code>
  </>;
}

function AssetFinding({ finding }: { finding: HtmlAssetFinding }) {
  return <>
    <ReferenceEvidence finding={finding} />
    {'targetPath' in finding ? <>
      <p className="field-label">{finding.status === 'MISSING' ? 'Expected packed file' : 'Packed target'}</p>
      <code className="report-code">{text(finding.targetPath)}</code>
      <p className={`finding-status ${finding.status === 'MISSING' ? 'missing-label' : ''}`}>
        {finding.status === 'MISSING' ? 'MISSING — Not found in package' : 'FOUND — Present in package'}
      </p>
    </> : <p>{text(finding.reason)}</p>}
  </>;
}

function RequiredFiles({ findings }: { findings: readonly RequiredFileFinding[] }) {
  const ordered = [...findings.filter(item => item.status === 'MISSING'), ...findings.filter(item => item.status === 'FOUND')];
  if (ordered.length === 0) return null;
  return <section className="report-section" aria-labelledby="required-report-heading">
    <h3 id="required-report-heading">Required files</h3>
    <ReportList items={ordered} label="required files" render={item => <>
      <code className="report-code">{text(item.path)}</code>
      <p className={`finding-status ${item.status === 'MISSING' ? 'missing-label' : ''}`}>
        {item.status === 'MISSING' ? 'MISSING — Missing from packed package' : 'FOUND — Present'}
      </p>
    </>} />
  </section>;
}

export function AuditReport({ audit }: { audit: PackageAudit }) {
  const knownOutcome = Object.hasOwn(outcomeCopy, audit.outcome);
  const description = knownOutcome ? outcomeCopy[audit.outcome] : 'The report outcome is unrecognized. This is not a clean result.';
  const missing = audit.htmlFindings.filter(item => item.status === 'MISSING');
  const unknown = audit.htmlFindings.filter(item => item.status === 'UNKNOWN');
  const found = audit.htmlFindings.filter(item => item.status === 'FOUND');
  const skipped = audit.htmlFindings.filter(item => item.status === 'SKIPPED');
  const unsupportedHtml = audit.htmlFindings.filter(item => !['FOUND', 'MISSING', 'UNKNOWN', 'SKIPPED'].includes(item.status));
  const unsupportedRequired = audit.requiredFileFindings.filter(item => !['FOUND', 'MISSING'].includes(item.status));
  const hasRequiredMissing = audit.requiredFileFindings.some(item => item.status === 'MISSING');
  const summary = audit.summary;
  return <article className="audit-report" aria-labelledby="report-heading">
    <header className={`report-summary ${knownOutcome ? audit.outcome.toLowerCase() : 'unrecognized'}`}>
      <h2 id="report-heading">Packed package report</h2>
      <p className="outcome-name">{text(audit.outcome)}</p>
      <p className="outcome-copy">{description}</p>
      <dl className="report-counts">
        <div className="missing-count"><dt>Missing</dt><dd>{count(summary.missing)}</dd></div>
        <div><dt>Unknown</dt><dd>{count(summary.unknown)}</dd></div>
        <div><dt>Found</dt><dd>{count(summary.found)}</dd></div>
        <div><dt>Skipped</dt><dd>{count(summary.skipped)}</dd></div>
      </dl>
      <p className="report-totals">Checked assertions: <strong>{count(summary.checkedAssertions)}</strong><br />
        HTML scanned: <strong>{count(summary.htmlFilesScanned)} / {count(summary.htmlFilesDiscovered)}</strong> discovered
        {summary.htmlFilesNotScanned !== 0 && <><br />Coverage gaps: <strong>{count(summary.htmlFilesNotScanned)}</strong></>}
      </p>
      <p className="help">Counts include required-file checks and HTML references. Coverage gaps are separate from Unknown findings.</p>
      {audit.outcome === 'NOT_AUDITABLE' && <>
        <p>{summary.htmlFilesDiscovered === 0
          ? 'No supported HTML files or required-file assertions were available to check.'
          : summary.htmlFilesScanned === 0 && summary.htmlFilesNotScanned > 0
            ? 'Supported HTML files could not be fully inspected.'
            : summary.unknown > 0
              ? 'No reference could be resolved confidently to a packed file.'
              : summary.skipped > 0
                ? 'The references found are outside package-local checks.'
                : 'The supported HTML contained no package-local assertions to check.'}</p>
        <p><strong>Add expected package files above and scan again.</strong></p>
      </>}
      <p className="report-limitation">This is a static packed-artifact check. It does not guarantee that the package works at runtime.</p>
    </header>

    {missing.length > 0 && <section className="report-section missing-section" aria-labelledby="missing-heading">
      <h3 id="missing-heading">Missing packed assets</h3>
      <ReportList items={missing} label="missing references" render={item => <AssetFinding finding={item} />} />
    </section>}
    {hasRequiredMissing && <RequiredFiles findings={audit.requiredFileFindings} />}

    {audit.htmlCoverageIssues.length > 0 && <section className="report-section coverage-section" aria-labelledby="coverage-heading">
      <h3 id="coverage-heading">Coverage limitations</h3>
      <p>These files were not fully inspected, so the audit is incomplete.</p>
      <ReportList items={audit.htmlCoverageIssues} label="coverage limitations" render={item => <>
        <code className="report-code">{text(item.htmlPath)}</code>
        <p>{text(item.reason)}</p><p className="help">Code: <code>{text(item.code)}</code></p>
      </>} />
    </section>}
    {unknown.length > 0 && <section className="report-section" aria-labelledby="unknown-heading">
      <h3 id="unknown-heading">Could not determine</h3>
      <p>These references could not be resolved confidently. They do not establish a missing file.</p>
      <ReportList items={unknown} label="unknown references" render={item => <AssetFinding finding={item} />} />
    </section>}
    {!hasRequiredMissing && <RequiredFiles findings={audit.requiredFileFindings} />}

    {found.length > 0 && <section className="report-section" aria-labelledby="found-heading">
      <h3 id="found-heading">Verified packed references</h3>
      <ReportList items={found} label="verified references" render={item => <AssetFinding finding={item} />} />
    </section>}
    {skipped.length > 0 && <details className="report-section skipped-section">
      <summary>Outside package-local checks</summary>
      <p>External/non-package references are intentionally not checked for packed-file existence.</p>
      <ReportList items={skipped} label="skipped references" render={item => <AssetFinding finding={item} />} />
    </details>}

    {(unsupportedHtml.length > 0 || unsupportedRequired.length > 0) && <section className="report-section">
      <h3>Unrecognized finding data</h3><p>Some findings have unsupported states. They are not treated as successful checks.</p>
      <ReportList items={unsupportedHtml} label="unrecognized references" render={item => <>
        <ReferenceEvidence finding={item} /><p>Status: {text(item.status)}</p>
      </>} />
      <ReportList items={unsupportedRequired} label="unrecognized required files" render={item => <>
        <code className="report-code">{text(item.path)}</code><p>Status: {text(item.status)}</p>
      </>} />
    </section>}
  </article>;
}
