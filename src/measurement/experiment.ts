import { captureConfig, COHORT_PATTERN, DirectCapture } from './capture';
import { coarseErrorCategory, makeEvent } from './events';
import type { CoarseCompletion, EventName } from './events';

export const EXPERIMENT_KEY = 'b08.experiment.v1';
export const INTERNAL_KEY = 'b08.internal';
export const MAX_POLICY_HISTORY = 8;
export const REUSE_DELAY_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
interface PolicyRecord { digest: string; visit: string; completedAt: number }
interface Metadata { cohort: string; completedReal: boolean; policies: PolicyRecord[] }
type LocalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface ExperimentEnvironment {
  token?: string; host?: string; development: boolean; hostname: string;
  url: string; replaceUrl: (url: string) => void; storage: LocalStorage;
  crypto: Crypto; fetch: typeof fetch; now: () => number;
}
export interface ExperimentPrompts {
  readonly laterRelease: boolean; readonly paidInterest: boolean; readonly requiredPolicyUsed: boolean;
  readonly laterAnswered?: boolean; readonly interestSent?: boolean;
}
export interface ExperimentAttempt {
  readonly requiredPolicyUsed: boolean; readonly priorReal: boolean;
  readonly digest: Promise<string | undefined>;
  finished: boolean; completed: boolean; laterAnswered: boolean; interestSent: boolean; meaningful: boolean;
}

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return !host || host === 'localhost' || host.endsWith('.localhost') || /^127\./u.test(host) ||
    ['0.0.0.0', '::1', '[::1]'].includes(host);
}

/** Also removes the mode parameter; query data is never sent to capture. */
function internalMode(env: ExperimentEnvironment): boolean {
  try {
    const url = new URL(env.url);
    const mode = url.searchParams.get('internal');
    if (mode === '1') env.storage.setItem(INTERNAL_KEY, '1');
    if (mode === '0') env.storage.removeItem(INTERNAL_KEY);
    if (mode === '1' || mode === '0') {
      url.searchParams.delete('internal');
      env.replaceUrl(url.pathname + url.search + url.hash);
    }
    return mode === '1' || env.storage.getItem(INTERNAL_KEY) === '1';
  } catch { return true; } // Missing local storage fails closed, not as a product error.
}

function readMetadata(storage: LocalStorage): Metadata | undefined {
  const raw = storage.getItem(EXPERIMENT_KEY);
  if (!raw || raw.length > 4096) return undefined;
  try {
    const data = JSON.parse(raw) as Metadata;
    if (!COHORT_PATTERN.test(data.cohort) || typeof data.completedReal !== 'boolean' || !Array.isArray(data.policies)) return undefined;
    const policies: PolicyRecord[] = [];
    for (const record of data.policies.slice(-MAX_POLICY_HISTORY)) {
      if (record && /^[0-9a-f]{64}$/u.test(record.digest) && UUID.test(record.visit) &&
        Number.isSafeInteger(record.completedAt) && record.completedAt >= 0) {
        policies.push({ digest: record.digest, visit: record.visit, completedAt: record.completedAt });
      }
    }
    return { cohort: data.cohort, completedReal: data.completedReal, policies };
  } catch { return undefined; }
}

async function policyDigest(paths: readonly string[], crypto: Crypto): Promise<string | undefined> {
  try {
    // Measurement-only bounds; never reject/change the policy supplied to the engine.
    if (!paths.length || paths.length > 1000 || paths.reduce((n, path) => n + path.length, 0) > 131072) return undefined;
    const bytes = new TextEncoder().encode(JSON.stringify(paths));
    if (bytes.length > 131072) return undefined;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch { return undefined; }
}

export class ExperimentMeasurement {
  private metadata?: Metadata;
  private visit = '';
  private capture?: DirectCapture;
  private disabled = false;
  constructor(private readonly env: ExperimentEnvironment) {
    const internal = internalMode(env);
    const config = captureConfig(env.token, env.host);
    if (internal || env.development || isLocalHost(env.hostname) || !config) return;
    try {
      this.metadata = readMetadata(env.storage);
      this.visit = env.crypto.randomUUID();
      if (!UUID.test(this.visit)) return;
      this.capture = new DirectCapture(config, env.fetch);
    } catch { this.disabled = true; }
  }
  private ready(): boolean {
    if (!this.capture || this.disabled) return false;
    try { return this.env.storage.getItem(INTERNAL_KEY) !== '1'; }
    catch { this.disabled = true; return false; }
  }
  private save(): boolean {
    try { this.env.storage.setItem(EXPERIMENT_KEY, JSON.stringify(this.metadata)); return true; }
    catch { this.disabled = true; return false; }
  }
  private emit(name: EventName, properties: unknown = {}): void {
    const event = makeEvent(name, properties);
    if (!this.ready() || !event || !this.metadata) return;
    try { this.capture?.capture(this.metadata.cohort, event); } catch { /* Best effort only. */ }
  }
  start(paths: readonly string[], source: 'user' | 'example' | null): ExperimentAttempt | undefined {
    if (source !== 'user' || !this.ready()) return undefined;
    if (!this.metadata) {
      this.metadata = { cohort: `b08_${this.env.crypto.randomUUID()}`, completedReal: false, policies: [] };
      if (!COHORT_PATTERN.test(this.metadata.cohort) || !this.save()) return undefined;
    }
    const attempt: ExperimentAttempt = { requiredPolicyUsed: paths.length > 0, priorReal: this.metadata.completedReal,
      digest: policyDigest(paths, this.env.crypto), finished: false, completed: false, laterAnswered: false, interestSent: false, meaningful: false };
    this.emit('b08_real_scan_started', { required_policy_used: attempt.requiredPolicyUsed });
    return attempt;
  }
  complete(attempt: ExperimentAttempt, coarse: CoarseCompletion): ExperimentPrompts | undefined {
    if (!this.ready() || attempt.finished || !this.metadata) return undefined;
    attempt.finished = true;
    attempt.completed = true;
    attempt.meaningful = coarse.supported_check_performed;
    this.emit('b08_real_scan_completed', { outcome: coarse.outcome, missing_found: coarse.missing_found,
      unknown_or_coverage_present: coarse.unknown_or_coverage_present, required_policy_used: attempt.requiredPolicyUsed,
      supported_check_performed: coarse.supported_check_performed });
    this.metadata.completedReal = true;
    if (!this.save()) return undefined;
    void attempt.digest.then(digest => {
      if (!digest || !this.ready() || !this.metadata) return;
      const prior = this.metadata.policies.find(record => record.digest === digest);
      const now = this.env.now();
      if (prior && prior.visit !== this.visit && now - prior.completedAt >= REUSE_DELAY_MS) this.emit('b08_required_policy_reused');
      this.metadata.policies = [...this.metadata.policies.filter(record => record.digest !== digest),
        { digest, visit: this.visit, completedAt: now }].slice(-MAX_POLICY_HISTORY);
      this.save();
    }).catch(() => {});
    return Object.freeze({ laterRelease: attempt.priorReal,
      paidInterest: attempt.meaningful && attempt.requiredPolicyUsed, requiredPolicyUsed: attempt.requiredPolicyUsed });
  }
  fail(attempt: ExperimentAttempt, code: unknown): void {
    if (attempt.finished) return;
    attempt.finished = true;
    const category = coarseErrorCategory(code);
    if (category) this.emit('b08_real_scan_failed', { category });
  }
  answerLaterRelease(attempt: ExperimentAttempt, yes: boolean): boolean {
    if (!this.ready() || !attempt.completed || !attempt.priorReal || attempt.laterAnswered) return false;
    attempt.laterAnswered = true;
    if (yes) this.emit('b08_later_release_confirmed');
    return true;
  }
  paidInterest(attempt: ExperimentAttempt): boolean {
    if (!this.ready() || !attempt.completed || !attempt.meaningful || !attempt.requiredPolicyUsed || attempt.interestSent) return false;
    attempt.interestSent = true;
    this.emit('b08_paid_pack_interest', { required_policy_used: attempt.requiredPolicyUsed });
    return true;
  }
}

export function createBrowserMeasurement(): ExperimentMeasurement | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return new ExperimentMeasurement({ token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN, host: import.meta.env.VITE_POSTHOG_HOST,
      development: import.meta.env.DEV, hostname: location.hostname, url: location.href,
      replaceUrl: url => history.replaceState(history.state, '', url), storage: localStorage, crypto,
      fetch: fetch.bind(window), now: Date.now });
  } catch { return undefined; }
}
