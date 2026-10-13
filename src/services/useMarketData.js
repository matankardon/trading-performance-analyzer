import { useCallback, useEffect, useRef, useState } from "react";
import { computeMarketScore, keyLevels } from "./marketScore";
import { fetchHistoricalBars } from "./historicalDataService";
import { readSymbolMap, resolveChartSymbol } from "./symbolMap";

export const MARKET_DATA_CACHE_KEY = "tradeCatalystMarketDataCache";
export const MARKET_DATA_CACHE_TTL = 5 * 60 * 1000;
export const MARKET_TIMEFRAMES = Object.freeze(["15m", "1h", "4h", "1d"]);
export const MARKET_DATA_SOURCE = "Massive via historical-data";

const LOOKBACK_DAYS = Object.freeze({ "15m": 60, "1h": 150, "4h": 500, "1d": 600 });
const CACHE_LIMIT = 20;
const memoryCache = new Map();

function normalizedSymbol(symbol) {
  return resolveChartSymbol(symbol, readSymbolMap()) || "";
}

export function providerSymbolVariants(symbol) {
  const base = normalizedSymbol(symbol);
  if (!base) return [];
  if (/^[CXI]:/.test(base)) return [base];

  if (/^(XAU|XAG|XPT|XPD)[A-Z]{3}$/.test(base)) return [`C:${base}`, base];
  if (/^(BTC|ETH|SOL|XRP|ADA|DOGE|LTC|BCH|AVAX|DOT|LINK|MATIC|SHIB|UNI|ATOM)[A-Z]{3,4}$/.test(base)) {
    return [`X:${base}`, base];
  }
  if (/^[A-Z]{6}$/.test(base)) return [`C:${base}`, base];
  if (/^(SPX|SPX500|NDX|NAS100|DJI|US30|RUT|VIX)$/.test(base)) return [`I:${base}`, base];
  return [base];
}

function cacheKey(symbol, timeframe) {
  return `${symbol}:${timeframe}`;
}

function readSessionCache(key, now) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(MARKET_DATA_CACHE_KEY) || "{}");
    const entry = stored[key];
    return entry && Number.isFinite(entry.cachedAt) && now - entry.cachedAt < MARKET_DATA_CACHE_TTL
      ? entry
      : null;
  } catch {
    return null;
  }
}

function writeSessionCache(key, entry) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(MARKET_DATA_CACHE_KEY) || "{}");
    const entries = Object.entries(stored).filter(([, item]) => (
      item && Number.isFinite(item.cachedAt) && Date.now() - item.cachedAt < MARKET_DATA_CACHE_TTL
    ));
    const next = Object.fromEntries([...entries.filter(([existingKey]) => existingKey !== key), [key, entry]].slice(-CACHE_LIMIT));
    sessionStorage.setItem(MARKET_DATA_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Market data remains usable when browser session storage is unavailable.
  }
}

function readCache(key, now) {
  const entry = memoryCache.get(key) || readSessionCache(key, now);
  if (!entry || now - entry.cachedAt >= MARKET_DATA_CACHE_TTL) {
    memoryCache.delete(key);
    return null;
  }
  memoryCache.set(key, entry);
  return entry;
}

function writeCache(key, bars, providerSymbol) {
  const entry = { cachedAt: Date.now(), bars, providerSymbol };
  memoryCache.set(key, entry);
  writeSessionCache(key, entry);
}

function utcDate(date) {
  return date.toISOString().slice(0, 10);
}

export function historicalDateRange(timeframe, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (LOOKBACK_DAYS[timeframe] || LOOKBACK_DAYS["1h"]));
  return { startDate: utcDate(start), endDate: utcDate(end) };
}

function isSymbolNotFound(error) {
  return error?.code === "MASSIVE_SYMBOL_NOT_FOUND"
    || /symbol.{0,20}(not found|invalid)|not found.{0,20}symbol/i.test(error?.message || "");
}

export async function fetchMarketBars(symbol, timeframe, { signal, bypassCache = false } = {}) {
  const resolved = normalizedSymbol(symbol);
  if (!resolved) throw new Error(`Could not resolve "${symbol}" to a market-data symbol.`);
  if (!MARKET_TIMEFRAMES.includes(timeframe)) throw new Error(`Unsupported market timeframe: ${timeframe}.`);

  const key = cacheKey(resolved, timeframe);
  if (!bypassCache) {
    const cached = readCache(key, Date.now());
    if (cached) return { bars: cached.bars, providerSymbol: cached.providerSymbol, cached: true };
  }

  const { startDate, endDate } = historicalDateRange(timeframe);
  const variants = providerSymbolVariants(resolved);
  for (const providerSymbol of variants) {
    if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
    try {
      const bars = await fetchHistoricalBars(providerSymbol, timeframe, startDate, endDate, { signal });
      if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
      if (bars.length) {
        writeCache(key, bars, providerSymbol);
        return { bars, providerSymbol, cached: false };
      }
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      if (!isSymbolNotFound(error)) throw error;
    }
  }

  return { bars: [], providerSymbol: variants.at(-1) || resolved, cached: false };
}

function buildReadyData(symbol, timeframe, payload) {
  const { bars, providerSymbol, cached } = payload;
  const lastBar = bars.at(-1) || null;
  const priorBar = bars.at(-2) || null;
  const absolute = lastBar && priorBar ? lastBar.close - priorBar.close : null;
  const percent = lastBar && priorBar && priorBar.close !== 0
    ? (absolute / priorBar.close) * 100
    : null;
  return {
    status: bars.length ? "ready" : "nodata",
    bars,
    result: bars.length ? computeMarketScore(bars, { timeframe }) : null,
    levels: bars.length ? keyLevels(bars) : null,
    latest: lastBar ? {
      price: lastBar.close,
      change: absolute,
      changePercent: percent,
      timestamp: lastBar.timestamp,
    } : null,
    lastBar: lastBar?.timestamp ?? null,
    source: `${MARKET_DATA_SOURCE} · ${providerSymbol}`,
    providerSymbol,
    cached,
    error: "",
    triedSymbols: providerSymbolVariants(symbol),
  };
}

const emptyState = {
  status: "nodata",
  bars: [],
  result: null,
  levels: null,
  latest: null,
  lastBar: null,
  source: MARKET_DATA_SOURCE,
  providerSymbol: null,
  cached: false,
  error: "",
  triedSymbols: [],
};

export function useMarketData(symbol, timeframe = "1h") {
  const [state, setState] = useState(emptyState);
  const [refreshToken, setRefreshToken] = useState(0);
  const bypassCacheRef = useRef(false);
  const resolvedSymbol = normalizedSymbol(symbol);
  const refresh = useCallback(() => {
    bypassCacheRef.current = true;
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!resolvedSymbol) return undefined;

    const controller = new AbortController();
    let active = true;

    const bypassCache = bypassCacheRef.current;
    bypassCacheRef.current = false;
    fetchMarketBars(resolvedSymbol, timeframe, {
      signal: controller.signal,
      bypassCache,
    }).then((payload) => {
      if (active) setState({
        ...buildReadyData(resolvedSymbol, timeframe, payload),
        requestKey: cacheKey(resolvedSymbol, timeframe),
        requestToken: refreshToken,
      });
    }).catch((error) => {
      if (!active || error?.name === "AbortError") return;
      setState({
        ...emptyState,
        status: "error",
        requestKey: cacheKey(resolvedSymbol, timeframe),
        requestToken: refreshToken,
        source: MARKET_DATA_SOURCE,
        triedSymbols: providerSymbolVariants(resolvedSymbol),
        error: error?.code === "MASSIVE_RATE_LIMITED"
          ? `Rate limit: ${error.message}`
          : error?.message || "Historical market data could not be loaded.",
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshToken, resolvedSymbol, timeframe]);

  if (!resolvedSymbol) return { ...emptyState, refresh };
  const requestKey = cacheKey(resolvedSymbol, timeframe);
  if (state.requestKey !== requestKey || state.requestToken !== refreshToken) {
    return {
      ...emptyState,
      status: "loading",
      triedSymbols: providerSymbolVariants(resolvedSymbol),
      refresh,
    };
  }
  return { ...state, refresh };
}

export function clearMarketDataCache() {
  memoryCache.clear();
  try {
    sessionStorage.removeItem(MARKET_DATA_CACHE_KEY);
  } catch {
    // Cache clearing should not prevent market data from being requested.
  }
}
