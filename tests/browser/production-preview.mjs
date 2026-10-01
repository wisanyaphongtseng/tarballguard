// Local acceptance tooling only. No server is deployed with the static app.
import { readFileSync } from 'node:fs';
import { preview } from 'vite';

const headers = Object.fromEntries(readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')
  .split(/\r?\n/u).filter(line => /^\s+[^:]+:/u.test(line)).map(line => {
    const separator = line.indexOf(':');
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true, headers } });
server.printUrls();
