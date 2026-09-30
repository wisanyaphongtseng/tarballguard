import { expect, test } from 'vitest';
import { build } from 'vite';

test('production Vite client entry emits the frozen engine as a separate worker asset', async () => {
  // The unfinished production UI does not call the client yet. Build its public
  // entry separately to verify the future integration's actual Vite worker URL.
  const result = await build({
    configFile: false, logLevel: 'silent',
    build: { write: false, rollupOptions: { input: 'src/worker/client.ts', preserveEntrySignatures: 'strict' } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => 'output' in item ? item.output : []);
  const worker = outputs.find(item => item.fileName.includes('scan.worker-'));
  expect(worker).toBeDefined();
  const main = outputs.find(item => item.type === 'chunk');
  expect(main?.type === 'chunk' && main.code).toContain(worker!.fileName);
  expect(main?.type === 'chunk' && main.code).not.toContain('PAX extended headers');
  expect(worker?.type === 'asset' && worker.source).toContain('PAX extended headers');
});
