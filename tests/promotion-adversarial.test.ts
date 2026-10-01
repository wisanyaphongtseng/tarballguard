import { expect, test, vi } from 'vitest';
import { ingestArchive } from '../src/engine/archive';
import { auditPackage } from '../src/engine/package-audit';
import { tgzFixture } from './archive-fixture';
import { cases } from './promotion-adversarial-fixtures';

test.each(cases)('audit fixture: $name', async fixture => {
  const sentinel = globalThis as typeof globalThis & { __auditExecuted?: boolean };
  const previous = sentinel.__auditExecuted;
  sentinel.__auditExecuted = false;
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No fixture network'));
  try {
    const ingestion = ingestArchive(fixture.bytes ?? tgzFixture(fixture.entries!), fixture.limits);
    if (fixture.error) {
      await expect(ingestion).rejects.toMatchObject({ code: fixture.error });
    } else {
      const audit = auditPackage(await ingestion, fixture.required);
      if (fixture.expect) expect(audit.htmlFindings.map(f => f.status)).toEqual(fixture.expect);
      if (fixture.outcome) expect(audit.outcome).toBe(fixture.outcome);
      if (fixture.coverage) expect(audit.htmlCoverageIssues.some(c => c.code === fixture.coverage)).toBe(true);
      if (fixture.name.includes('base-') && fixture.name !== 'base-target-only' ||
          fixture.name.startsWith('encoded-') || fixture.name === 'malformed-percent-literal') {
        expect(audit.outcome).toBe('NOT_AUDITABLE');
        expect(audit.htmlFindings.every(f => f.status === 'UNKNOWN' && !('targetPath' in f))).toBe(true);
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(sentinel.__auditExecuted).toBe(false);
  } finally { fetch.mockRestore();
    if (previous === undefined) delete sentinel.__auditExecuted; else sentinel.__auditExecuted = previous;
  }
});

test.each([
  '<base target="_blank">', '<template><base href="assets/"></template>',
  '<script>const text = "<base href=assets/>";</script>',
  '<svg><base href="assets/" /></svg>',
])('inert/no-href base preserves ordinary references: %s', async prefix => {
  const index = await ingestArchive(tgzFixture([{ path: 'package/index.html', content: prefix + '<img src="app.js">' },
    { path: 'package/app.js' }]));
  expect(auditPackage(index).htmlFindings[0].status).toBe('FOUND');
});

test.each(['', './assets/', 'https://example.invalid/', '/assets/'])('base href %j leaves required assertions independent', async href => {
  const index = await ingestArchive(tgzFixture([{ path: 'package/index.html', content:
    `<base href="${href}"><script src="app.js"></script><img src="https://example.invalid/a%20.svg"><img src="/root.svg">` },
    { path: 'package/app.js' }]));
  const audit = auditPackage(index, ['app.js']);
  expect(audit.htmlFindings.map(f => f.status)).toEqual(['UNKNOWN', 'SKIPPED', 'UNKNOWN']);
  expect(audit.outcome).toBe('CHECKED_WITH_UNKNOWNS');
  expect(audit.requiredFileFindings).toEqual([{ path: 'app.js', status: 'FOUND' }]);
  expect(auditPackage(index, ['absent.html']).outcome).toBe('ISSUES_FOUND');
});
