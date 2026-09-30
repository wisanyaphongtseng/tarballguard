import { gzipSync } from 'node:zlib';

export interface FixtureEntry {
  path: string;
  content?: string | Uint8Array;
  type?: string;
  prefix?: string;
  linkname?: string;
}

const encoder = new TextEncoder();

export function writeField(header: Uint8Array, offset: number, length: number, value: string) {
  header.fill(0, offset, offset + length);
  header.set(encoder.encode(value), offset);
}

export function checksum(header: Uint8Array) {
  header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  writeField(header, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
}

export function tarFixture(entries: FixtureEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    const content = typeof entry.content === 'string'
      ? encoder.encode(entry.content)
      : entry.content ?? new Uint8Array();
    const header = new Uint8Array(512);
    writeField(header, 0, 100, entry.path);
    writeField(header, 100, 8, '0000644');
    writeField(header, 108, 8, '0000000');
    writeField(header, 116, 8, '0000000');
    writeField(header, 124, 12, content.length.toString(8).padStart(11, '0'));
    writeField(header, 136, 12, '00000000000');
    writeField(header, 156, 1, entry.type ?? '0');
    writeField(header, 157, 100, entry.linkname ?? '');
    writeField(header, 257, 6, 'ustar');
    writeField(header, 263, 2, '00');
    writeField(header, 329, 8, '0000000');
    writeField(header, 337, 8, '0000000');
    writeField(header, 345, 155, entry.prefix ?? '');
    checksum(header);
    const payload = new Uint8Array(Math.ceil(content.length / 512) * 512);
    payload.set(content);
    parts.push(header, payload);
  }
  parts.push(new Uint8Array(1024));
  const tar = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    tar.set(part, offset);
    offset += part.length;
  }
  return tar;
}

export function gzipFixture(tar: Uint8Array): ArrayBuffer {
  return Uint8Array.from(gzipSync(tar, { level: 9 })).buffer;
}

export function tgzFixture(entries: FixtureEntry[]): ArrayBuffer {
  return gzipFixture(tarFixture(entries));
}
