import { createCacheKey, getCached, setCached } from "./cache";
import { createDataError, createDataResponse } from "./dataErrors";
import { DATA_STATUS } from "./dataStatus";
import { normalizeSentiment } from "./normalization";
import { getDataProvider } from "./providers/registry";

const SENTIMENT_CACHE_MS = 5 * 60 * 1_000;

export async function getSentiment(request = {}) {
  const key = createCacheKey("sentiment", request);
  const cached = getCached(key, SENTIMENT_CACHE_MS);
  if (cached) return cached;

  try {
    const response = await getDataProvider("sentiment").getSentiment(request);
    if (response?.error) return response;
    const data = normalizeSentiment(response?.data || {}, { ...response.metadata, dataStatus: DATA_STATUS.LIVE });
    const result = createDataResponse({ data, metadata: response?.metadata });
    return setCached(key, result);
  } catch (cause) {
    return createDataResponse({ error: createDataError({ code: "PROVIDER_ERROR", message: "Sentiment provider failed", cause }) });
  }
}
