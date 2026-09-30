import { ArchiveError } from './archive-model';

/** Keeps one decompressor chunk; allocates only the bounded requested payload. */
export class BoundedStreamReader {
  private chunk: Uint8Array = new Uint8Array();
  private offset = 0;
  private consumedBytes = 0;
  private receivedBytes = 0;

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly maxBytes: number,
  ) {}

  get totalBytes(): number {
    return this.receivedBytes;
  }

  private async nextChunk(): Promise<boolean> {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await this.reader.read();
    } catch (error) {
      if (error instanceof DOMException &&
          (error.name === 'NotReadableError' || error.name === 'NotFoundError')) {
        throw new ArchiveError('READ_FAILED', 'The source file could not be read. Select the file again.');
      }
      throw new ArchiveError('INVALID_GZIP', 'Gzip data is invalid or truncated.');
    }
    if (result.done) return false;
    if (result.value.byteLength > this.maxBytes - this.receivedBytes) {
      throw new ArchiveError('LIMIT_EXCEEDED', 'Decompressed archive exceeds the byte limit.');
    }
    this.receivedBytes += result.value.byteLength;
    this.chunk = result.value;
    this.offset = 0;
    return true;
  }

  async readExactly(length: number): Promise<Uint8Array> {
    if (length > this.maxBytes - this.consumedBytes) {
      throw new ArchiveError('LIMIT_EXCEEDED', 'Requested archive payload exceeds the byte limit.');
    }
    const bytes = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (this.offset === this.chunk.length && !await this.nextChunk()) {
        throw new ArchiveError('INVALID_TAR', 'TAR data is truncated.');
      }
      const count = Math.min(length - written, this.chunk.length - this.offset);
      bytes.set(this.chunk.subarray(this.offset, this.offset + count), written);
      this.offset += count;
      written += count;
      this.consumedBytes += count;
    }
    return bytes;
  }

  async finishZeroTrailer(): Promise<void> {
    // Drain through gzip EOF so CRC/truncation failures cannot yield an index.
    do {
      if (this.chunk.subarray(this.offset).some(byte => byte !== 0)) {
        throw new ArchiveError('INVALID_TAR', 'Nonzero data follows the TAR end markers.');
      }
      this.consumedBytes += this.chunk.length - this.offset;
      this.offset = this.chunk.length;
    } while (await this.nextChunk());
    if (this.receivedBytes % 512 !== 0) {
      throw new ArchiveError('INVALID_TAR', 'TAR data is not block aligned.');
    }
  }
}
