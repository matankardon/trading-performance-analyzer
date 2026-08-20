const memoryCache = new Map();

export function createCacheKey(namespace, request = {}) {
  return `${namespace}:${JSON.stringify(request)}`;
}

export function getCached(key, maxAgeMs) {
  const entry = memoryCache.get(key);
  if (!entry || Date.now() - entry.cachedAt > maxAgeMs) return null;
  return entry.value;
}

export function setCached(key, value) {
  memoryCache.set(key, { cachedAt: Date.now(), value });
  return value;
}

export function clearDataCache() {
  memoryCache.clear();
}
