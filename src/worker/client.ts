import type { PackageAudit } from '../engine/package-audit';
import type { ScanErrorCode, ScanErrorData, ScanRequest, ScanResponse } from './protocol';

export const SCAN_TIMEOUT_MS = 30000;

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly entryIndex?: number;
  constructor(error: ScanErrorData) {
    super(error.message);
    this.name = 'ScanError';
    this.code = error.code;
    this.entryIndex = error.entryIndex;
  }
}

/** Structured cloning removes freezes. Restore them on plain audit records only. */
function freezeAudit(result: PackageAudit): PackageAudit {
  const pending: object[] = [result];
  while (pending.length) {
    const item = pending.pop()!;
    if (Object.isFrozen(item)) continue;
    for (const value of Object.values(item)) {
      if (value !== null && typeof value === 'object') pending.push(value);
    }
    Object.freeze(item);
  }
  return result;
}

export class PackageScanClient {
  private nextId = 0;
  private active?: { readonly cancel: () => void };

  cancel(): void { this.active?.cancel(); }

  /** ArrayBuffer ownership transfers; File is structured-cloned and read in the worker. */
  scan(input: ArrayBuffer | File, requiredPaths: readonly string[] = []): Promise<PackageAudit> {
    this.cancel();
    const requestId = ++this.nextId;
    return new Promise((resolve, reject) => {
      let worker: Worker | undefined;
      let settled = false;
      const finish = (result?: PackageAudit, error?: ScanErrorData) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
          worker.terminate();
        }
        this.active = undefined;
        if (error) reject(new ScanError(error));
        else resolve(freezeAudit(result!));
      };
      const timer = setTimeout(() => finish(undefined, {
        code: 'TIMEOUT', message: 'Package scan exceeded the 30-second timeout.',
      }), SCAN_TIMEOUT_MS);
      this.active = { cancel: () => finish(undefined, { code: 'CANCELLED', message: 'Package scan cancelled.' }) };
      try {
        worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<ScanResponse>) => {
          if (settled || event.data.requestId !== requestId) return;
          if (event.data.type === 'SCAN_RESULT') finish(event.data.result);
          else if (event.data.type === 'SCAN_ERROR') finish(undefined, event.data.error);
        };
        worker.onerror = event => {
          event.preventDefault();
          finish(undefined, { code: 'WORKER_FAILED', message: 'Package scan worker failed to run.' });
        };
        worker.onmessageerror = () => finish(undefined, {
          code: 'WORKER_FAILED', message: 'Package scan worker returned unreadable data.',
        });
      } catch {
        finish(undefined, { code: 'WORKER_FAILED', message: 'Package scan worker could not start.' });
        return;
      }
      try {
        const request: ScanRequest = { type: 'SCAN', requestId, input, requiredPaths };
        worker.postMessage(request, input instanceof ArrayBuffer ? [input] : []);
      } catch {
        finish(undefined, { code: 'TRANSFER_FAILED', message: 'Package scan input could not be sent to the worker.' });
      }
    });
  }
}
