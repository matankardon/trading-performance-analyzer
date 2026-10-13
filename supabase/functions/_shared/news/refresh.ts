export type RefreshResult<T> =
  | { status: "fresh"; data: T; refreshedAt: string | null }
  | { status: "refreshed"; data: T; refreshedAt: string }
  | { status: "stale"; data: T; refreshedAt: string | null; refreshing: boolean; refreshFailed: boolean }
  | { status: "unavailable"; refreshing: boolean };

export function isNewsCacheStale(
  refreshedAt: string | null | undefined,
  now = Date.now(),
  maxAgeMs = 10 * 60 * 1000,
): boolean {
  if (!refreshedAt) return true;
  const timestamp = Date.parse(refreshedAt);
  return !Number.isFinite(timestamp) || now - timestamp >= maxAgeMs;
}

export async function refreshWithStaleFallback<T>(
  cached: T | null,
  refreshedAt: string | null,
  acquireLock: () => Promise<boolean>,
  refresh: () => Promise<{ data: T; refreshedAt: string }>,
): Promise<RefreshResult<T>> {
  if (cached !== null && !isNewsCacheStale(refreshedAt)) {
    return { status: "fresh", data: cached, refreshedAt };
  }
  let acquired = false;
  try {
    acquired = await acquireLock();
    if (!acquired) {
      return cached === null
        ? { status: "unavailable", refreshing: true }
        : { status: "stale", data: cached, refreshedAt, refreshing: true, refreshFailed: false };
    }
    const result = await refresh();
    return { status: "refreshed", ...result };
  } catch {
    return cached === null
      ? { status: "unavailable", refreshing: false }
      : { status: "stale", data: cached, refreshedAt, refreshing: false, refreshFailed: true };
  }
}
