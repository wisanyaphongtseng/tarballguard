export const outcomes = ['ISSUES_FOUND', 'CHECKED_NO_ISSUES', 'CHECKED_WITH_UNKNOWNS', 'NOT_AUDITABLE'] as const;
export const errorCategories = ['UNSUPPORTED_ARCHIVE', 'UNSAFE_OR_MALFORMED_ARCHIVE', 'RESOURCE_LIMIT', 'INVALID_POLICY', 'TIMEOUT', 'UNEXPECTED'] as const;
export const artifactProvenances = ['own', 'third_party', 'unknown'] as const;
export type ArtifactProvenance = typeof artifactProvenances[number];
export function isArtifactProvenance(value: unknown): value is ArtifactProvenance {
  return artifactProvenances.includes(value as ArtifactProvenance);
}
export type EventName = 'b08_real_scan_started' | 'b08_real_scan_completed' | 'b08_real_scan_failed' |
  'b08_evidence_opened' | 'b08_required_policy_reused' | 'b08_later_release_confirmed' | 'b08_paid_pack_interest';
export interface CoarseCompletion {
  outcome: typeof outcomes[number];
  missing_found: boolean;
  unknown_or_coverage_present: boolean;
  required_policy_used: boolean;
  supported_check_performed: boolean;
  html_present: boolean;
  html_scanned: boolean;
  local_html_reference_checked: boolean;
}
export interface ExperimentEvent {
  readonly event: EventName;
  readonly properties: Readonly<Record<string, boolean | string>>;
}

/** Runtime allowlist: never serialize a caller's object, even if TypeScript trusts it. */
export function makeEvent(name: unknown, candidate: unknown = {}): ExperimentEvent | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const p = candidate as Record<string, unknown>;
  let properties: Record<string, boolean | string>;
  switch (name) {
    case 'b08_real_scan_started': case 'b08_paid_pack_interest':
      if (!isArtifactProvenance(p.artifact_provenance) || typeof p.required_policy_used !== 'boolean') return undefined;
      properties = { required_policy_used: p.required_policy_used, artifact_provenance: p.artifact_provenance }; break;
    case 'b08_real_scan_completed':
      if (!isArtifactProvenance(p.artifact_provenance) || typeof p.html_present !== 'boolean' ||
        typeof p.html_scanned !== 'boolean' || typeof p.local_html_reference_checked !== 'boolean' ||
        !outcomes.includes(p.outcome as typeof outcomes[number]) ||
        typeof p.missing_found !== 'boolean' || typeof p.unknown_or_coverage_present !== 'boolean' ||
        typeof p.required_policy_used !== 'boolean' || typeof p.supported_check_performed !== 'boolean') return undefined;
      properties = { outcome: p.outcome as string, missing_found: p.missing_found,
        unknown_or_coverage_present: p.unknown_or_coverage_present, required_policy_used: p.required_policy_used,
        supported_check_performed: p.supported_check_performed, artifact_provenance: p.artifact_provenance,
        html_present: p.html_present, html_scanned: p.html_scanned, local_html_reference_checked: p.local_html_reference_checked }; break;
    case 'b08_real_scan_failed':
      if (!isArtifactProvenance(p.artifact_provenance) || !errorCategories.includes(p.category as typeof errorCategories[number])) return undefined;
      properties = { category: p.category as string, artifact_provenance: p.artifact_provenance }; break;
    case 'b08_evidence_opened':
      if (!isArtifactProvenance(p.artifact_provenance) || typeof p.local_html_reference_checked !== 'boolean' ||
        typeof p.required_policy_used !== 'boolean') return undefined;
      properties = { artifact_provenance: p.artifact_provenance,
        local_html_reference_checked: p.local_html_reference_checked, required_policy_used: p.required_policy_used }; break;
    case 'b08_required_policy_reused':
      if (typeof p.local_html_reference_checked !== 'boolean' || typeof p.prior_local_html_reference_checked !== 'boolean') return undefined;
      properties = { local_html_reference_checked: p.local_html_reference_checked,
        prior_local_html_reference_checked: p.prior_local_html_reference_checked }; break;
    case 'b08_later_release_confirmed': properties = {}; break;
    default: return undefined;
  }
  return Object.freeze({ event: name, properties: Object.freeze(properties) });
}

export function coarseErrorCategory(code: unknown): typeof errorCategories[number] | undefined {
  switch (code) {
    case 'CANCELLED': return undefined;
    case 'UNSUPPORTED_TAR': return 'UNSUPPORTED_ARCHIVE';
    case 'UNSAFE_PATH': case 'DUPLICATE_PATH': case 'PATH_CONFLICT': case 'INVALID_INPUT':
    case 'INVALID_GZIP': case 'INVALID_TAR': return 'UNSAFE_OR_MALFORMED_ARCHIVE';
    case 'LIMIT_EXCEEDED': return 'RESOURCE_LIMIT';
    case 'INVALID_POLICY': return 'INVALID_POLICY';
    case 'TIMEOUT': return 'TIMEOUT';
    default: return 'UNEXPECTED';
  }
}
