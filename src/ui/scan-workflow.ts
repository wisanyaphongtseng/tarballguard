import type { PackageAudit } from '../engine/package-audit';
import { ScanError } from '../worker/client';

export type ScanPhase = 'idle' | 'ready' | 'scanning' | 'completed' | 'error' | 'cancelled';
export interface ScanState {
  readonly phase: ScanPhase;
  readonly file: File | null;
  readonly requiredText: string;
  readonly audit?: PackageAudit;
  readonly message?: string;
}
interface ScanClient {
  scan(input: File, requiredPaths: readonly string[]): Promise<PackageAudit>;
  cancel(): void;
}

/** Preserve path spelling, including surrounding spaces, as required by the policy contract. */
export function requiredPathsFromText(text: string): string[] {
  return text.split(/\r\n|\r|\n/u).filter(line => line.trim() !== '');
}

export function scanErrorMessage(error: unknown): string {
  if (!(error instanceof ScanError)) return 'The scan could not complete. Try again with your package.';
  switch (error.code) {
    case 'UNSUPPORTED_TAR':
      return 'This archive format is not supported. Extended TAR headers, including some non-ASCII or long filenames, are unsupported.';
    case 'UNSAFE_PATH': case 'DUPLICATE_PATH': case 'PATH_CONFLICT':
      return 'This archive contains unsafe or conflicting file paths. It was not scanned.';
    case 'INVALID_INPUT': case 'INVALID_GZIP': case 'INVALID_TAR':
      return 'This file is not a readable npm .tgz archive, or the archive is malformed.';
    case 'LIMIT_EXCEEDED':
      return 'This package exceeds the supported archive size or file limits.';
    case 'INVALID_POLICY':
      return 'A required-file path is invalid. Use package-relative paths without a leading /, backslashes, or .. segments.';
    case 'TIMEOUT':
      return 'The scan exceeded 30 seconds and was stopped. Try a smaller package.';
    case 'CANCELLED':
      return 'Scan cancelled. Your package is still selected.';
    case 'READ_FAILED':
      return 'The package could not be read. Select the file again and retry.';
    case 'UNSUPPORTED_BROWSER':
      return 'This browser does not support the archive features needed. Try a current browser.';
    default:
      return 'The scan could not complete. Try again with your package.';
  }
}

export function canScan(state: ScanState): boolean {
  return state.file !== null && state.phase !== 'scanning';
}

/** UI lifecycle only. No archive, path, or finding logic belongs here. */
export class ScanWorkflow {
  private state: ScanState = Object.freeze({ phase: 'idle', file: null, requiredText: '' });
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly client: ScanClient) {}
  getSnapshot = (): ScanState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(state: ScanState): void {
    this.state = Object.freeze(state);
    for (const listener of this.listeners) listener();
  }
  private interrupt(): void {
    this.generation++;
    if (this.state.phase === 'scanning') this.client.cancel();
  }
  selectFiles(files: readonly File[]): void {
    if (files.length === 0) return; // Dismissing the picker keeps the current selection.
    this.interrupt();
    const base = { requiredText: this.state.requiredText, file: null };
    if (files.length !== 1) {
      this.update({ ...base, phase: 'error', message: 'Choose one npm .tgz package at a time.' });
    } else if (!/\.tgz$/iu.test(files[0].name)) {
      this.update({ ...base, phase: 'error', message: 'Choose an npm package file ending in .tgz.' });
    } else {
      this.update({ ...base, phase: 'ready', file: files[0] });
    }
  }
  removeFile(): void {
    this.interrupt();
    this.update({ phase: 'idle', file: null, requiredText: this.state.requiredText });
  }
  setRequiredText(requiredText: string): void {
    if (this.state.phase === 'scanning') return;
    this.update({ file: this.state.file, requiredText, phase: this.state.file ? 'ready' : 'idle' });
  }
  async start(): Promise<void> {
    if (!canScan(this.state)) return;
    const generation = ++this.generation;
    const { file, requiredText } = this.state;
    this.update({ phase: 'scanning', file, requiredText });
    try {
      const audit = await this.client.scan(file!, requiredPathsFromText(requiredText));
      if (generation === this.generation) this.update({ phase: 'completed', file, requiredText, audit });
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({ phase: error instanceof ScanError && error.code === 'CANCELLED' ? 'cancelled' : 'error',
        file, requiredText, message: scanErrorMessage(error) });
    }
  }
  cancel(): void {
    if (this.state.phase !== 'scanning') return;
    this.interrupt();
    this.update({ phase: 'cancelled', file: this.state.file, requiredText: this.state.requiredText,
      message: 'Scan cancelled. Your package is still selected.' });
  }
}
