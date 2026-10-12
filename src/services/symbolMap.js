export const CHART_SYMBOL_MAP_STORAGE_KEY = "tradeCatalystChartSymbolMap";

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
