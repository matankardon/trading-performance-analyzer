import { createCacheKey, getCached, setCached } from "./cache";
import { createDataError, createDataResponse } from "./dataErrors";
import { DATA_STATUS } from "./dataStatus";
import { normalizeHistoricalBars, normalizeQuote } from "./normalization";
import { getDataProvider } from "./providers/registry";

const QUOTE_CACHE_MS = 5_000;
const HISTORICAL_CACHE_MS = 60 * 60 * 1_000;

async function requestProvider(operation, request) {
  const provider = getDataProvider("market");
  try {
    const response = await provider[operation](request);
    if (response?.error) return response;
    return response || createDataResponse({ error: createDataError({ message: "Market data provider returned no response" }) });
  } catch (cause) {
    return createDataResponse({ error: createDataError({ code: "PROVIDER_ERROR", message: "Market data provider failed", cause }) });
  }
}

export async function getQuote(request = {}) {
  const key = createCacheKey("quote", request);
  const cached = getCached(key, QUOTE_CACHE_MS);
  if (cached) return cached;

  const response = await requestProvider("getQuote", request);
  if (response.error) return response;
  const data = normalizeQuote(response.data || {}, request, { ...response.metadata, dataStatus: DATA_STATUS.LIVE });
  const result = createDataResponse({ data, metadata: data.metadata });
  return setCached(key, result);
}

export async function getHistoricalBars(request = {}) {
  const key = createCacheKey("historical-bars", request);
  const cached = getCached(key, HISTORICAL_CACHE_MS);
  if (cached) return cached;

  const response = await requestProvider("getHistoricalBars", request);
  if (response.error) return response;
  const data = normalizeHistoricalBars(response.data || [], request, { ...response.metadata, dataStatus: DATA_STATUS.HISTORICAL });
  const result = createDataResponse({ data, metadata: data.metadata });
  return setCached(key, result);
}
