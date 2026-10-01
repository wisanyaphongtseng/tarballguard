/** Deployment-owned URL only; never populated from scanned package data. */
export const DEFAULT_SOURCE_REPOSITORY_URL = 'https://github.com/wisanyaphongtseng/tarballguard';

export function sourceRepositoryUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_SOURCE_REPOSITORY_URL;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return DEFAULT_SOURCE_REPOSITORY_URL;
    return url.href;
  } catch { return DEFAULT_SOURCE_REPOSITORY_URL; }
}
