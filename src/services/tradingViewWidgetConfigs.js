import { toTradingViewSymbol } from "./symbolMap";

const PRIMITIVE_TYPES = new Set(["string", "number", "boolean"]);

export const TRADING_VIEW_TICKER_SYMBOLS = Object.freeze([
  { proName: "OANDA:XAUUSD", title: "Gold" },
  { proName: "FX:EURUSD", title: "EURUSD" },
  { proName: "FX:GBPUSD", title: "GBPUSD" },
  { proName: "FX:USDJPY", title: "USDJPY" },
  { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
  { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
  { proName: "FOREXCOM:NSXUSD", title: "Nasdaq 100" },
  { proName: "TVC:DXY", title: "US Dollar Index" },
].map((symbol) => Object.freeze(symbol)));

function isPrimitive(value) {
  return value === null || (PRIMITIVE_TYPES.has(typeof value)
    && (typeof value !== "number" || Number.isFinite(value)));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function assertTradingViewWidgetConfig(scriptName, config) {
  if (!isPlainObject(config)) throw new TypeError("TradingView widget config must be a plain object.");

  Object.entries(config).forEach(([key, value]) => {
    const tickerSymbolsAllowed = scriptName === "ticker-tape" && key === "symbols";
    if (tickerSymbolsAllowed) {
      if (!Array.isArray(value) || !value.every((symbol) => (
        isPlainObject(symbol)
        && Object.keys(symbol).length === 2
        && typeof symbol.proName === "string"
        && typeof symbol.title === "string"
      ))) {
        throw new TypeError('Ticker Tape "symbols" must contain only { proName, title } objects.');
      }
      return;
    }
    if (Array.isArray(value) && value.every(isPrimitive)) return;
    if (!isPrimitive(value)) {
      throw new TypeError(`TradingView widget config value "${key}" must be primitive.`);
    }
  });
  return true;
}

export function buildTickerTapeConfig() {
  const config = {
    symbols: TRADING_VIEW_TICKER_SYMBOLS,
    isTransparent: true,
    colorTheme: "dark",
    locale: "en",
  };
  assertTradingViewWidgetConfig("ticker-tape", config);
  return config;
}

export function buildEconomicCalendarConfig() {
  const config = {
    colorTheme: "dark",
    isTransparent: true,
    locale: "en",
  };
  assertTradingViewWidgetConfig("events", config);
  return config;
}

export function buildTimelineConfig() {
  const config = {
    feedMode: "market",
    market: "stock",
    colorTheme: "dark",
    isTransparent: true,
    width: "100%",
    height: "100%",
    locale: "en",
  };
  assertTradingViewWidgetConfig("timeline", config);
  return config;
}

export function buildTechnicalAnalysisConfig(symbol) {
  const config = {
    interval: "1D",
    width: "100%",
    isTransparent: true,
    height: "100%",
    symbol: String(symbol ?? ""),
    showIntervalTabs: true,
    displayMode: "single",
    locale: "en",
    colorTheme: "dark",
  };
  assertTradingViewWidgetConfig("technical-analysis", config);
  return config;
}

export function buildTechnicalSymbolOptions(journaledAssets = [], userMap = {}) {
  const options = [];
  const seen = new Set();
  journaledAssets.forEach((asset) => {
    const name = String(asset ?? "").trim();
    const symbol = toTradingViewSymbol(name, userMap);
    if (!name || !symbol || seen.has(symbol)) return;
    seen.add(symbol);
    options.push({ label: name, symbol });
  });
  TRADING_VIEW_TICKER_SYMBOLS.forEach(({ proName, title }) => {
    if (seen.has(proName)) return;
    seen.add(proName);
    options.push({ label: title, symbol: proName });
  });
  return options;
}
