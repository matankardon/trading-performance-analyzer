import { createDataError, createDataResponse } from "../dataErrors";
import { createSourceMetadata, DATA_STATUS } from "../dataStatus";

export function createUnavailableProvider(domain, message = `${domain} provider is not configured`) {
  const unavailable = (operation) => Promise.resolve(createDataResponse({
    error: createDataError({ code: "PROVIDER_UNAVAILABLE", message, source: null }),
    metadata: createSourceMetadata({ dataStatus: DATA_STATUS.UNAVAILABLE }),
    operation,
  }));

  return {
    id: null,
    domain,
    getQuote: () => unavailable("getQuote"),
    getHistoricalBars: () => unavailable("getHistoricalBars"),
    getNews: () => unavailable("getNews"),
    getEconomicEvents: () => unavailable("getEconomicEvents"),
    getSentiment: () => unavailable("getSentiment"),
  };
}
