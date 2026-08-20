import { createSourceMetadata, DATA_STATUS } from "./dataStatus";
import { validateBar, validateRequiredFields } from "./validation";

function pick(value, fallback = null) {
  return value === undefined ? fallback : value;
}

export function normalizeBar(raw = {}, metadata = {}) {
  const bar = {
    timestamp: pick(raw.timestamp, pick(raw.t, null)),
    open: Number(pick(raw.open, raw.o)),
    high: Number(pick(raw.high, raw.h)),
    low: Number(pick(raw.low, raw.l)),
    close: Number(pick(raw.close, raw.c)),
    volume: raw.volume === undefined && raw.v === undefined ? null : Number(pick(raw.volume, raw.v)),
  };
  const validation = validateBar(bar);
  return { ...bar, metadata: createSourceMetadata(metadata), validation };
}

export function normalizeHistoricalBars(rawBars = [], request = {}, metadata = {}) {
  const bars = rawBars.map((bar) => normalizeBar(bar, metadata));
  const invalidBar = bars.find((bar) => !bar.validation.valid);
  const requestValidation = validateRequiredFields(request, ["asset", "timeframe", "startDate", "endDate"]);

  return {
    asset: request.asset || null,
    timeframe: request.timeframe || null,
    startDate: request.startDate || null,
    endDate: request.endDate || null,
    bars,
    metadata: createSourceMetadata({ ...metadata, dataStatus: metadata.dataStatus || DATA_STATUS.HISTORICAL }),
    validation: invalidBar?.validation || requestValidation,
  };
}

export function normalizeQuote(raw = {}, request = {}, metadata = {}) {
  const quote = {
    asset: request.asset || raw.asset || raw.symbol || null,
    timeframe: request.timeframe || null,
    timestamp: raw.timestamp || raw.t || null,
    open: raw.open === undefined && raw.o === undefined ? null : Number(pick(raw.open, raw.o)),
    high: raw.high === undefined && raw.h === undefined ? null : Number(pick(raw.high, raw.h)),
    low: raw.low === undefined && raw.l === undefined ? null : Number(pick(raw.low, raw.l)),
    close: raw.close === undefined && raw.c === undefined ? null : Number(pick(raw.close, raw.c)),
    volume: raw.volume === undefined && raw.v === undefined ? null : Number(pick(raw.volume, raw.v)),
  };
  return { ...quote, metadata: createSourceMetadata(metadata) };
}

export function normalizeNewsRecord(raw = {}, metadata = {}) {
  return {
    headline: raw.headline || raw.title || null,
    source: raw.source || null,
    publishedAt: raw.publishedAt || raw.published_at || null,
    retrievedAt: raw.retrievedAt || raw.retrieved_at || null,
    url: raw.url || raw.link || null,
    asset: raw.asset || raw.symbol || null,
    market: raw.market || null,
    category: raw.category || null,
    impact: raw.impact || null,
    sentiment: raw.sentiment || null,
    metadata: createSourceMetadata(metadata),
  };
}

export function normalizeEconomicEvent(raw = {}, metadata = {}) {
  return {
    event: raw.event || raw.title || null,
    country: raw.country || null,
    currency: raw.currency || null,
    date: raw.date || null,
    time: raw.time || null,
    impact: raw.impact || null,
    actual: raw.actual ?? null,
    forecast: raw.forecast ?? null,
    previous: raw.previous ?? null,
    metadata: createSourceMetadata(metadata),
  };
}

export function normalizeSentiment(raw = {}, metadata = {}) {
  return {
    sentiment: raw.sentiment || null,
    score: raw.score ?? null,
    direction: raw.direction || raw.bias || null,
    methodology: raw.methodology || null,
    metadata: createSourceMetadata(metadata),
  };
}
