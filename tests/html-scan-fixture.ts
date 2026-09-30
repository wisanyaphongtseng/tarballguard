import type { FixtureEntry } from './archive-fixture';

/** Packed HTML references app.js, but only style.css is present. */
export const missingReferenceEntries: FixtureEntry[] = [
  {
    path: 'package/index.html',
    content: '<link href="./style.css">\n<script src="./app.js"></script>\n',
  },
  { path: 'package/style.css', content: 'body { color: black; }\n' },
];
