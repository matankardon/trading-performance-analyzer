import { createCacheKey, getCached, setCached } from "./cache";
import { createDataError, createDataResponse } from "./dataErrors";
import { DATA_STATUS } from "./dataStatus";
import { normalizeNewsRecord } from "./normalization";
import { getDataProvider } from "./providers/registry";

const NEWS_CACHE_MS = 5 * 60 * 1_000;

export async function getNews(request = {}) {
  const key = createCacheKey("news", request);
  const cached = getCached(key, NEWS_CACHE_MS);
  if (cached) return cached;

  try {
    const response = await getDataProvider("news").getNews(request);
    if (response?.error) return response;
    const records = (response?.data || []).map((record) => normalizeNewsRecord(record, { ...response.metadata, dataStatus: DATA_STATUS.LIVE }));
    const result = createDataResponse({ data: records, metadata: response?.metadata });
    return setCached(key, result);
  } catch (cause) {
    return createDataResponse({ error: createDataError({ code: "PROVIDER_ERROR", message: "News provider failed", cause }) });
  }
}
