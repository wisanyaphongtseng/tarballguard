import type { FixtureEntry } from './archive-fixture';

/** Deterministic artifact with library code, but no packed dist/index.html. */
export const missingRequiredFileEntries: FixtureEntry[] = [
  {
    path: 'package/package.json',
    content: '{"name":"missing-required-file","version":"1.0.0","files":["lib"]}\n',
  },
  { path: 'package/lib/index.js', content: 'export {};\n' },
];
