import { runScan } from './run-scan';
import type { ScanRequest, ScanResponse } from './protocol';

// Keep worker globals local rather than adding conflicting DOM/WebWorker libs.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ScanRequest>) => void) | null;
  postMessage: (response: ScanResponse) => void;
};
scope.onmessage = event => {
  if (event.data.type === 'SCAN') void runScan(event.data, response => scope.postMessage(response));
};
