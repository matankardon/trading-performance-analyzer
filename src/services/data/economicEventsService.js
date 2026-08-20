import { createCacheKey, getCached, setCached } from "./cache";
import { createDataError, createDataResponse } from "./dataErrors";
import { DATA_STATUS } from "./dataStatus";
import { normalizeEconomicEvent } from "./normalization";
import { getDataProvider } from "./providers/registry";

const EVENTS_CACHE_MS = 5 * 60 * 1_000;

export async function getEconomicEvents(request = {}) {
  const key = createCacheKey("economic-events", request);
  const cached = getCached(key, EVENTS_CACHE_MS);
  if (cached) return cached;

  try {
    const response = await getDataProvider("economic").getEconomicEvents(request);
    if (response?.error) return response;
    const records = (response?.data || []).map((record) => normalizeEconomicEvent(record, { ...response.metadata, dataStatus: DATA_STATUS.LIVE }));
    const result = createDataResponse({ data: records, metadata: response?.metadata });
    return setCached(key, result);
  } catch (cause) {
    return createDataResponse({ error: createDataError({ code: "PROVIDER_ERROR", message: "Economic events provider failed", cause }) });
  }
}
