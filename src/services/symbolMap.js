export const CHART_SYMBOL_MAP_STORAGE_KEY = "tradeCatalystChartSymbolMap";
export const TRADINGVIEW_SYMBOL_MAP_STORAGE_KEY = "tradeCatalystTradingViewSymbolMap";

const BUILT_IN_ALIASES = Object.freeze({
  CFDSONGOLDUSOZ: "XAUUSD",
  GOLD: "XAUUSD",
  XAU: "XAUUSD",
  XAUUSD: "XAUUSD",
  EURUSD: "EURUSD",
  USDJPY: "USDJPY",
  GBPUSD: "GBPUSD",
  AUDUSD: "AUDUSD",
  NZDUSD: "NZDUSD",
  US30: "US30",
  DOW: "US30",
  SPX: "SPX",
  SP500: "SPX",
  NAS100: "NAS100",
  NASDAQ: "NAS100",
  NQ: "NAS100",
  QQQ: "QQQ",
  BTCUSD: "BTCUSD",
  ETHUSD: "ETHUSD",
  SOLUSD: "SOLUSD",
  XAGUSD: "XAGUSD",
  GC: "XAUUSD",
});

const TRADINGVIEW_ALIASES = Object.freeze({
  CFDSONGOLDUSOZ: "OANDA:XAUUSD",
  GOLD: "OANDA:XAUUSD",
  XAU: "OANDA:XAUUSD",
  XAUUSD: "OANDA:XAUUSD",
  // Gold is verified as OANDA:XAUUSD. Other provider aliases below are unverified.
  SILVER: "OANDA:XAGUSD",
  XAG: "OANDA:XAGUSD",
  XAGUSD: "OANDA:XAGUSD",
  EURUSD: "FX:EURUSD",
  USDJPY: "FX:USDJPY",
  GBPUSD: "FX:GBPUSD",
  AUDUSD: "FX:AUDUSD",
  NZDUSD: "FX:NZDUSD",
  USDCAD: "FX:USDCAD",
  USDCHF: "FX:USDCHF",
  EURGBP: "FX:EURGBP",
  EURJPY: "FX:EURJPY",
  GBPJPY: "FX:GBPJPY",
  AUDJPY: "FX:AUDJPY",
  US30: "OANDA:US30USD",
  DOW: "OANDA:US30USD",
  NAS100: "OANDA:NAS100USD",
  NASDAQ: "OANDA:NAS100USD",
  NQ: "OANDA:NAS100USD",
  SPX: "OANDA:SPX500USD",
  SP500: "OANDA:SPX500USD",
  SPX500: "OANDA:SPX500USD",
  BTCUSD: "BITSTAMP:BTCUSD",
});
const GOLD_TRADINGVIEW_ALTERNATIVES = Object.freeze([
  "OANDA:XAUUSD",
  "TVC:GOLD",
  "FX_IDC:XAUUSD",
]);

export function normalizeSymbolKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

export function readSymbolMap() {
  try {
    const stored = JSON.parse(localStorage.getItem(CHART_SYMBOL_MAP_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

export function writeSymbolMap(value) {
  try {
    localStorage.setItem(CHART_SYMBOL_MAP_STORAGE_KEY, JSON.stringify(value || {}));
    return true;
  } catch {
    return false;
  }
}

export function readTradingViewSymbolMap() {
  try {
    const stored = JSON.parse(localStorage.getItem(TRADINGVIEW_SYMBOL_MAP_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

export function writeTradingViewSymbolMap(value) {
  try {
    localStorage.setItem(TRADINGVIEW_SYMBOL_MAP_STORAGE_KEY, JSON.stringify(value || {}));
    return true;
  } catch {
    return false;
  }
}

export function resolveChartSymbol(assetName, userMap = {}) {
  const rawName = String(assetName ?? "").trim();
  if (!rawName) return null;

  const normalizedUserMap = userMap && typeof userMap === "object" ? userMap : {};
  const candidateKeys = [rawName, rawName.toUpperCase(), rawName.toLowerCase(), normalizeSymbolKey(rawName)];
  for (const candidate of candidateKeys) {
    const mapped = normalizedUserMap[candidate] || normalizedUserMap[normalizeSymbolKey(candidate)];
    if (typeof mapped === "string" && mapped.trim()) {
      return mapped.trim().toUpperCase();
    }
  }

  const aliasKey = normalizeSymbolKey(rawName);
  if (BUILT_IN_ALIASES[aliasKey]) {
    return BUILT_IN_ALIASES[aliasKey];
  }

  if (/^([A-Z]:)?[A-Za-z0-9.-]{1,12}$/.test(rawName)) {
    return rawName.toUpperCase();
  }

  return null;
}

export function toTradingViewSymbol(assetOrTicker, userMap = {}) {
  const rawName = String(assetOrTicker ?? "").trim();
  if (!rawName) return null;

  const normalizedUserMap = userMap && typeof userMap === "object" ? userMap : {};
  const candidateKeys = [rawName, rawName.toUpperCase(), rawName.toLowerCase(), normalizeSymbolKey(rawName)];
  for (const candidate of candidateKeys) {
    const mapped = normalizedUserMap[candidate] || normalizedUserMap[normalizeSymbolKey(candidate)];
    if (typeof mapped === "string" && mapped.trim()) return mapped.trim().toUpperCase();
  }

  const alias = TRADINGVIEW_ALIASES[normalizeSymbolKey(rawName)];
  if (alias) return alias;
  if (/^[A-Za-z0-9_]+:[A-Za-z0-9.-]{1,12}$/.test(rawName)) return rawName;
  if (/^[A-Za-z0-9.-]{1,12}$/.test(rawName)) return rawName.toUpperCase();
  return null;
}

export function tradingViewSymbolAlternatives(assetOrTicker) {
  const symbolKey = normalizeSymbolKey(assetOrTicker);
  if (["CFDSONGOLDUSOZ", "GOLD", "XAU", "XAUUSD"].includes(symbolKey)) {
    return [...GOLD_TRADINGVIEW_ALTERNATIVES];
  }
  return [];
}
