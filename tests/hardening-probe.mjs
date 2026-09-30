// Standalone reproduction harness. Run with node --max-old-space-size=256.
import { build } from 'vite';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { tgzFixture } from './archive-fixture.ts';

const modules = ['html-references', 'package-audit', 'archive'];
const source = modules.map(name => `export * from ${JSON.stringify(resolve(`src/engine/${name}.ts`).replaceAll('\\', '/'))};`).join('\n');
const bundle = await build({
  configFile: false, logLevel: 'silent',
  plugins: [{ name: 'probe-entry', resolveId(id) { if (id.endsWith('probe-entry')) return '\0probe-entry'; },
    load(id) { if (id === '\0probe-entry') return source; } }],
  build: { write: false, lib: { entry: 'probe-entry', formats: ['es'] } },
});
const chunk = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(item => item.output)
  .find(item => item.type === 'chunk');
const engine = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));

for (const [name, html] of [
  ['90000 nested divs', '<div>'.repeat(90000) + '</div>'.repeat(90000)],
  ['100000 attributes', '<div ' + Array.from({ length: 100000 }, (_, i) => `a${i}`).join(' ') + '>'],
]) {
  const start = performance.now();
  try { engine.extractHtmlReferences(html); throw new Error('Expected rejection'); }
  catch (error) {
    if (error.code !== 'HTML_COMPLEXITY_LIMIT') throw error;
    console.log(JSON.stringify({ name, bytes: Buffer.byteLength(html), code: error.code,
      milliseconds: +(performance.now() - start).toFixed(2) }));
  }
}
const compressed = tgzFixture(Array.from({ length: 30 }, (_, i) => ({
  path: `package/${i}.html`, content: '<img src=x>'.repeat(90000),
})));
const index = await engine.ingestArchive(compressed);
let start = performance.now();
const many = engine.auditPackage(index);
console.log(JSON.stringify({ name: '30 HTML files x 90000 references', outcome: many.outcome,
  findings: many.htmlFindings.length, gaps: many.htmlCoverageIssues.length,
  milliseconds: +(performance.now() - start).toFixed(2), heapMiB: +(process.memoryUsage().heapUsed / 1048576).toFixed(2) }));
let reads = 0;
const files = Array.from({ length: 10000 }, (_, i) => ({
  get path() { reads++; return `${i}.html`; }, size: 0, bytes: new Uint8Array(),
}));
start = performance.now();
const empty = engine.auditPackage({ files, entryCount: files.length, decompressedBytes: files.length * 512 });
console.log(JSON.stringify({ name: '10000 empty HTML files', scanned: empty.htmlFilesScanned.length,
  pathReads: reads, milliseconds: +(performance.now() - start).toFixed(2) }));
