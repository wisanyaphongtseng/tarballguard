import type { PackageAudit } from '../engine/package-audit';
import { ScanError } from '../worker/client';
import { createExamplePackage } from './example-package';
import type { ExperimentAttempt, ExperimentMeasurement, ExperimentPrompts } from '../measurement/experiment';

export type ScanPhase = 'idle' | 'ready' | 'scanning' | 'completed' | 'error' | 'cancelled';
export interface ScanState {
  readonly phase: ScanPhase;
  readonly file: File | null;
  readonly inputKind: 'user' | 'example' | null;
  readonly requiredText: string;
  readonly audit?: PackageAudit;
  readonly message?: string;
  readonly experiment?: ExperimentPrompts;
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
      return 'This package uses an archive format B08 does not support yet. No clean result was produced. Some extended TAR headers, including Unicode or very long filenames, are unsupported. See current v0 limitations below; this does not mean the package is broken.';
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
  private state: ScanState = Object.freeze({ phase: 'idle', file: null, inputKind: null, requiredText: '' });
  private generation = 0;
  private listeners = new Set<() => void>();
  private experimentAttempt?: ExperimentAttempt;
  constructor(private readonly client: ScanClient, private readonly measurement?: ExperimentMeasurement) {}
  private observe<T>(action: () => T): T | undefined {
    try { return action(); } catch { return undefined; } // Measurement cannot affect scanning.
  }
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
    this.experimentAttempt = undefined;
    if (this.state.phase === 'scanning') this.client.cancel();
  }
  selectFiles(files: readonly File[], inputKind: 'user' | 'example' = 'user'): void {
    if (files.length === 0) return; // Dismissing the picker keeps the current selection.
    this.interrupt();
    const base = { requiredText: this.state.requiredText, file: null, inputKind: null };
    if (files.length !== 1) {
      this.update({ ...base, phase: 'error', message: 'Choose one npm .tgz package at a time.' });
    } else if (!/\.tgz$/iu.test(files[0].name)) {
      this.update({ ...base, phase: 'error', message: 'Choose an npm package file ending in .tgz.' });
    } else {
      this.update({ ...base, phase: 'ready', file: files[0], inputKind });
    }
  }
  removeFile(): void {
    this.interrupt();
    this.update({ phase: 'idle', file: null, inputKind: null, requiredText: this.state.requiredText });
  }
  setRequiredText(requiredText: string): void {
    if (this.state.phase === 'scanning') return;
    this.update({ file: this.state.file, inputKind: this.state.inputKind, requiredText, phase: this.state.file ? 'ready' : 'idle' });
  }
  async tryExample(): Promise<void> {
    if (this.state.phase === 'scanning') return;
    this.setRequiredText('');
    this.selectFiles([createExamplePackage()], 'example');
    await this.start();
  }
  async start(): Promise<void> {
    if (!canScan(this.state)) return;
    const generation = ++this.generation;
    const { file, requiredText, inputKind } = this.state;
    const requiredPaths = requiredPathsFromText(requiredText);
    const attempt = this.observe(() => this.measurement?.start(requiredPaths, inputKind));
    this.experimentAttempt = attempt;
    this.update({ phase: 'scanning', file, requiredText, inputKind });
    try {
      const audit = await this.client.scan(file!, requiredPaths);
      if (generation === this.generation) {
        const experiment = attempt ? this.observe(() => this.measurement?.complete(attempt, {
          outcome: audit.outcome, missing_found: audit.summary.missing > 0,
          unknown_or_coverage_present: audit.summary.unknown > 0 || audit.summary.htmlFilesNotScanned > 0,
          required_policy_used: requiredPaths.length > 0, supported_check_performed: audit.summary.checkedAssertions > 0,
        })) : undefined;
        this.update({ phase: 'completed', file, requiredText, inputKind, audit, experiment });
      }
    } catch (error) {
      if (generation !== this.generation) return;
      if (attempt) this.observe(() => this.measurement?.fail(attempt, error instanceof ScanError ? error.code : undefined));
      this.update({ phase: error instanceof ScanError && error.code === 'CANCELLED' ? 'cancelled' : 'error',
        file, requiredText, inputKind, message: scanErrorMessage(error) });
    }
  }
  answerLaterRelease(yes: boolean): void {
    const { experiment } = this.state;
    if (this.state.phase !== 'completed' || !experiment?.laterRelease || !this.experimentAttempt) return;
    if (this.observe(() => this.measurement?.answerLaterRelease(this.experimentAttempt!, yes))) {
      this.update({ ...this.state, experiment: Object.freeze({ ...experiment, laterAnswered: true }) });
    }
  }
  expressPaidInterest(): void {
    const { experiment } = this.state;
    if (this.state.phase !== 'completed' || !experiment?.paidInterest || !this.experimentAttempt) return;
    if (this.observe(() => this.measurement?.paidInterest(this.experimentAttempt!))) {
      this.update({ ...this.state, experiment: Object.freeze({ ...experiment, interestSent: true }) });
    }
  }
  cancel(): void {
    if (this.state.phase !== 'scanning') return;
    this.interrupt();
    this.update({ phase: 'cancelled', file: this.state.file, inputKind: this.state.inputKind, requiredText: this.state.requiredText,
      message: 'Scan cancelled. Your package is still selected.' });
  }
}
