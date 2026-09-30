import type { ArchiveErrorCode } from '../engine/archive-model';
import type { PackageAudit } from '../engine/package-audit';

export interface ScanRequest {
  readonly type: 'SCAN';
  readonly requestId: number;
  readonly input: ArrayBuffer | File;
  readonly requiredPaths: readonly string[];
}

export type ScanErrorCode = ArchiveErrorCode | 'INVALID_POLICY' | 'CANCELLED' | 'TIMEOUT'
  | 'WORKER_FAILED' | 'INTERNAL_ERROR' | 'TRANSFER_FAILED';

export interface ScanErrorData {
  readonly code: ScanErrorCode;
  readonly message: string;
  readonly entryIndex?: number;
}

export type ScanResponse =
  | { readonly type: 'SCAN_STARTED'; readonly requestId: number }
  | { readonly type: 'SCAN_RESULT'; readonly requestId: number; readonly result: PackageAudit }
  | { readonly type: 'SCAN_ERROR'; readonly requestId: number; readonly error: ScanErrorData };
