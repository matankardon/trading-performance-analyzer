export const COMMON_TRADE_ASSETS = Object.freeze([
  "XAUUSD",
  "Gold",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "BTCUSD",
  "ETHUSD",
  "NAS100",
  "US30",
  "SPX500",
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "SPY",
  "QQQ",
]);

export function tradeAssetSuggestions(trades = []) {
  const priorAssets = trades
    .map((trade) => String(trade?.asset ?? "").trim())
    .filter(Boolean);
  return [...new Set([...priorAssets, ...COMMON_TRADE_ASSETS])];
}

const SYMBOL_ALIASES = Object.freeze({
  GOLD: "XAUUSD",
  XAU: "XAUUSD",
  SILVER: "XAGUSD",
  XAG: "XAGUSD",
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  AUDUSD: "AUDUSD",
  USDCAD: "USDCAD",
  BTCUSD: "BTCUSD",
  ETHUSD: "ETHUSD",
  NAS100: "NAS100",
  NASDAQ: "NAS100",
  US30: "US30",
  DOW: "US30",
  SPX: "SPX500",
  SP500: "SPX500",
  SPX500: "SPX500",
  AAPL: "AAPL",
  MSFT: "MSFT",
  NVDA: "NVDA",
  TSLA: "TSLA",
  SPY: "SPY",
  QQQ: "QQQ",
});

function normalized(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function suggestKnownSymbol(asset, maxDistance = 2) {
  const key = normalized(asset);
  if (!key) return null;
  if (SYMBOL_ALIASES[key]) return null;

  const candidates = [...new Set(Object.values(SYMBOL_ALIASES))];
  const closest = candidates
    .map((symbol) => ({ symbol, distance: editDistance(key, normalized(symbol)) }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((left, right) => left.distance - right.distance || left.symbol.localeCompare(right.symbol))[0];
  return closest?.symbol ?? null;
}
