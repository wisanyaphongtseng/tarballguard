import { ingestArchive } from '../engine/archive';
import { ArchiveError } from '../engine/archive-model';
import { auditPackage } from '../engine/package-audit';
import { RequiredFilePolicyError } from '../engine/required-files';
import type { ScanErrorData, ScanRequest, ScanResponse } from './protocol';

export function serializeScanError(error: unknown): ScanErrorData {
  if (error instanceof ArchiveError) return { code: error.code, message: error.message };
  if (error instanceof RequiredFilePolicyError) return {
    code: error.code, message: error.message,
    ...(error.entryIndex === undefined ? {} : { entryIndex: error.entryIndex }),
  };
  return { code: 'INTERNAL_ERROR', message: 'Package scan failed unexpectedly.' };
}

/** This handler runs in the worker; Node tests exercise the same engine composition. */
export async function runScan(request: ScanRequest, send: (response: ScanResponse) => void): Promise<void> {
  send({ type: 'SCAN_STARTED', requestId: request.requestId });
  try {
    const index = await ingestArchive(request.input);
    const result = auditPackage(index, request.requiredPaths);
    send({ type: 'SCAN_RESULT', requestId: request.requestId, result });
  } catch (error) {
    send({ type: 'SCAN_ERROR', requestId: request.requestId, error: serializeScanError(error) });
  }
}
