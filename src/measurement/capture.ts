import { makeEvent } from './events';
import type { ExperimentEvent } from './events';

export const COHORT_PATTERN = /^b08_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const DELIVERY_TIMEOUT_MS = 3000;
export function captureConfig(token: unknown, host: unknown): { token: string; endpoint: string } | undefined {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/u.test(token) || typeof host !== 'string') return undefined;
  try {
    const url = new URL(host);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return undefined;
    return { token, endpoint: `${url.origin}/i/v0/e/` };
  } catch { return undefined; }
}

/** No SDK, automatic properties, retries, cookie credentials, referrer, or request queue. */
export class DirectCapture {
  private pending = 0;
  constructor(private readonly config: { token: string; endpoint: string }, private readonly send: typeof fetch) {}
  capture(cohort: string, event: ExperimentEvent): void {
    const allowed = makeEvent(event.event, event.properties);
    if (!allowed || !COHORT_PATTERN.test(cohort) || this.pending >= 4) return;
    const properties = { ...allowed.properties, $process_person_profile: false, $geoip_disable: true };
    const body = JSON.stringify({ api_key: this.config.token, event: allowed.event, distinct_id: cohort, properties });
    const controller = new AbortController();
    this.pending++;
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    // The race releases the slot even if a faulty/mock transport ignores abort.
    const deadline = new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true }));
    let request: Promise<unknown>;
    try {
      request = this.send(this.config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: controller.signal });
    } catch { request = Promise.resolve(); }
    void Promise.race([request, deadline]).catch(() => {}).finally(() => { clearTimeout(timeout); this.pending--; });
  }
}
