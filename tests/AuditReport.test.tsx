import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ingestArchive } from '../src/engine/archive';
import { auditPackage } from '../src/engine/package-audit';
import type { PackageAudit } from '../src/engine/package-audit';
import { AuditReport } from '../src/ui/AuditReport';
import { ScanWorkflow } from '../src/ui/scan-workflow';
import { tgzFixture } from './archive-fixture';

const render = (audit: PackageAudit) => renderToStaticMarkup(<AuditReport audit={audit} />);
async function report(html: string, required: readonly string[] = [], extras: { path: string; content?: string }[] = []) {
  return auditPackage(await ingestArchive(tgzFixture([
    { path: 'package/index.html', content: html }, { path: 'package/app.js' }, ...extras,
  ])), required);
}
const clean = () => report('<script src="./app.js"></script>');

test('actual missing-reference fixture shows missing evidence, expected path, and source location', async () => {
  const bytes = await readFile(new URL('./fixtures/missing-reference.tgz', import.meta.url));
  const audit = auditPackage(await ingestArchive(Uint8Array.from(bytes).buffer));
  const html = render(audit);
  expect(html).toContain('ISSUES_FOUND');
  expect(html).toContain('Missing packed assets');
  expect(html).toContain('&lt;script src=&quot;./app.js&quot;&gt;');
  expect(html).toContain('Expected packed file');
  expect(html).toContain('>app.js</code>');
  const location = audit.htmlFindings[1].reference.location!;
  expect(html).toContain(`index.html:${location.line}:${location.column}`);
  expect(html).toContain('MISSING — Not found in package');
  expect(html).toContain('FOUND — Present in package');
});

test('required files distinguish missing and found, with missing first', async () => {
  const html = render(await report('', ['app.js', 'dist/index.html']));
  expect(html).toContain('Required package files');
  expect(html).toContain('MISSING — Missing from packed package');
  expect(html).toContain('FOUND — Present');
  expect(html.indexOf('>dist/index.html</code>')).toBeLessThan(html.indexOf('>app.js</code>'));
});

test('clean outcome uses conservative wording and always states limitations', async () => {
  const html = render(await clean());
  expect(html).toContain('CHECKED_NO_ISSUES');
  expect(html).toContain('No issues found in the checks that were performed.');
  expect(html).toContain('does not guarantee that the package works at runtime');
  expect(html).not.toMatch(/safe to publish|package passed|package is valid|\bPASS\b/iu);
});

test('found plus unknown displays uncertainty and unchanged resolver reason', async () => {
  const audit = await report('<script src=app.js></script><img src=/assets/runtime.js>');
  const html = render(audit);
  expect(html).toContain('CHECKED_WITH_UNKNOWNS');
  expect(html).toContain('could not be fully checked');
  expect(html).toContain('Could not determine');
  expect(html).toContain('/assets/runtime.js');
  const unknown = audit.htmlFindings[1];
  if (!('reason' in unknown)) throw new Error('Expected resolver reason');
  expect(html).toContain(unknown.reason);
});

test('not auditable explains missing scope and suggests required files', async () => {
  const audit = auditPackage(await ingestArchive(tgzFixture([{ path: 'package/README.md' }])));
  const html = render(audit);
  expect(html).toContain('NOT_AUDITABLE');
  expect(html).toContain('No supported HTML files or required-file assertions');
  expect(html).toContain('Add expected package files above and scan again.');
  expect(html).toContain('The audit could not perform a package-local check with the current rules.');
  expect(html).not.toContain('B08');
});

test('only skipped references explain why no local assertions were checked', async () => {
  const html = render(await report('<img src=https://example.test/image>'));
  expect(html).toContain('The references found are outside package-local checks.');
});

test('coverage limitations show file, code and reason alongside missing findings', async () => {
  const audit = await report('<img src=missing.svg>', [], [{ path: 'package/bad.html', content: '<!-->' }]);
  const html = render(audit);
  expect(html).toContain('ISSUES_FOUND');
  expect(html).toContain('Coverage limitations');
  expect(html).toContain('>bad.html</code>');
  expect(html).toContain('HTML_COMPLEXITY_LIMIT');
  expect(html).toContain(audit.htmlCoverageIssues[0].reason);
  expect(html).toContain('These files were not fully inspected, so the audit is incomplete.');
  expect(html).toContain('<dt>Coverage gaps</dt><dd>1</dd>');
});

test('all rejected HTML explains the not-auditable outcome', async () => {
  expect(render(await report('<!-->'))).toContain('Supported HTML files could not be fully inspected.');
});

test('skipped references are collapsed and classified outside package-local checks', async () => {
  const html = render(await report('<img src=https://example.test/image>'));
  expect(html).toContain('<details class="report-section skipped-section"><summary>Outside package-local checks</summary>');
  expect(html).toContain('External/non-package references are intentionally not checked for packed-file existence.');
  expect(html).not.toContain('<a ');
});

test('found references show source, literal, packed target and presence', async () => {
  const html = render(await clean());
  expect(html).toContain('Validated references');
  expect(html).toContain('HTML source:');
  expect(html).toContain('&lt;script src=&quot;./app.js&quot;&gt;');
  expect(html).toContain('Packed target');
  expect(html).toContain('>app.js</code>');
});

test('empty sections and zero coverage count are omitted', async () => {
  const html = render(await clean());
  for (const label of ['Missing packed assets', 'Coverage limitations', 'Could not determine', 'Required package files', 'Outside package-local checks', '<dt>Coverage gaps</dt>']) {
    expect(html).not.toContain(label);
  }
});

test('counts use the audit summary rather than visible findings', async () => {
  const audit = await clean();
  const html = render({ ...audit, summary: { ...audit.summary, found: 987, missing: 123, unknown: 456, skipped: 789,
    checkedAssertions: 1110, htmlFilesScanned: 12, htmlFilesDiscovered: 34, htmlFilesNotScanned: 22 } });
  for (const [label, value] of [['Found', 987], ['Missing', 123], ['Unknown', 456], ['Skipped', 789]]) {
    expect(html).toContain(`<dt>${label}</dt><dd>${value}</dd>`);
  }
  expect(html).toContain('Checked assertions: <strong>1110</strong>');
  expect(html).toContain('HTML scanned: <strong>12 / 34</strong>');
  expect(html).toContain('<dt>Coverage gaps</dt><dd>22</dd>');
});

test('malicious literals and paths are escaped without creating markup', async () => {
  const audit = await report('<img src="&quot;&gt;&lt;iframe src=evil&gt;">', [], [
    { path: 'package/<img src=x>.html', content: '<img src=missing>' },
  ]);
  const html = render(audit);
  expect(html).toContain('&lt;iframe src=evil&gt;');
  expect(html).toContain('&lt;img src=x&gt;.html');
  expect(html).not.toMatch(/<(?:img|script|iframe|a)\b/iu);
});

test('javascript and data references remain inert text with no resource attributes', async () => {
  const html = render(await report('<img src="javascript:alert(1)"><img src="data:text/html,test">'));
  expect(html).toContain('javascript:alert(1)');
  expect(html).toContain('data:text/html,test');
  expect(html).not.toMatch(/<[^>]*\s(?:href|src)=|<(?:img|script|iframe|a)\b/iu);
});

test('long paths remain code text', async () => {
  const value = `${'x'.repeat(3000)}.js`;
  const html = render(await report(`<script src="${value}"></script>`));
  expect(html).toContain(`<code class="report-code">${value}</code>`);
  expect(html).not.toContain('<script');
});

test('control and bidi characters have visible escapes in report text', async () => {
  const html = render(await report('<img src="name&#x202e;evil">'));
  expect(html).toContain('name\\u202eevil');
  expect(html).not.toContain('\u202e');
});

test('duplicate findings remain separate, in source order within their section', async () => {
  const html = render(await report('<img src=one><img src=two><img src=one>'));
  expect(html.match(/MISSING — Not found in package/gu)).toHaveLength(3);
  expect(html.indexOf('&quot;one&quot;')).toBeLessThan(html.indexOf('&quot;two&quot;'));
});

test('bounded rendering states exactly how many rows are shown', async () => {
  const html = render(await report('<img src=app.js>'.repeat(51)));
  expect(html).toContain('<dt>Found</dt><dd>51</dd>');
  expect(html.match(/FOUND — Present in package/gu)).toHaveLength(50);
  expect(html).toContain('Showing 50 of 51');
  expect(html).toContain('Show next 1 verified references');
});

test('invalid summary values and unexpected outcomes do not imply a clean audit', async () => {
  const audit = await clean();
  const html = render({ ...audit, outcome: 'NEW_OUTCOME', summary: { ...audit.summary, found: -1 } } as unknown as PackageAudit);
  expect(html).toContain('unrecognized. This is not a clean result.');
  expect(html).toContain('<dt>Found</dt><dd>Unavailable</dd>');
});

test('missing location is omitted without inventing diagnostics', async () => {
  const audit = await clean();
  const original = audit.htmlFindings[0];
  const html = render({ ...audit, htmlFindings: [{ ...original, reference: { ...original.reference, location: undefined } }] });
  expect(html).toContain('>index.html</code>');
  expect(html).not.toContain('index.html:');
});

test('selecting another file clears the old report and rescan replaces its findings', async () => {
  const first = await report('<img src=missing>');
  const second = await clean();
  let response = first;
  const workflow = new ScanWorkflow({ scan: async () => response, cancel: () => {} });
  workflow.selectFiles([new File(['fixture'], 'first.tgz')]);
  await workflow.start();
  expect(render(workflow.getSnapshot().audit!)).toContain('Missing packed assets');
  workflow.selectFiles([new File(['fixture'], 'second.tgz')]);
  expect(workflow.getSnapshot().audit).toBeUndefined();
  response = second;
  const pending = workflow.start();
  expect(workflow.getSnapshot().audit).toBeUndefined();
  await pending;
  expect(render(workflow.getSnapshot().audit!)).not.toContain('Missing packed assets');
  expect(workflow.getSnapshot().audit).toBe(second);
});

test('report uses semantic headings and lists without another noisy live region', async () => {
  const html = render(await clean());
  expect(html).toContain('aria-labelledby="report-heading"');
  expect(html).toContain('<ul class="report-list"><li>');
  expect(html).not.toContain('aria-live');
});
