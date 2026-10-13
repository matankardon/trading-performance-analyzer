import { describe, expect, it } from "vitest";
import {
  assertTradingViewWidgetConfig,
  buildEconomicCalendarConfig,
  buildTechnicalAnalysisConfig,
  buildTechnicalSymbolOptions,
  buildTickerTapeConfig,
  buildTimelineConfig,
  TRADING_VIEW_TICKER_SYMBOLS,
} from "./tradingViewWidgetConfigs";

describe("TradingView widget configs", () => {
  it("allows ticker tape symbol objects only in its symbols array", () => {
    const config = buildTickerTapeConfig();
    expect(config.symbols).toEqual(TRADING_VIEW_TICKER_SYMBOLS);
    expect(config).toMatchObject({ colorTheme: "dark", isTransparent: false, locale: "en" });
    expect(assertTradingViewWidgetConfig("ticker-tape", config)).toBe(true);
    expect(() => assertTradingViewWidgetConfig("timeline", config)).toThrow(/must be primitive/);
    expect(() => assertTradingViewWidgetConfig("ticker-tape", { symbols: [{ proName: "X", title: "X", extra: "bad" }] }))
      .toThrow(/symbols/);
    expect(() => assertTradingViewWidgetConfig("ticker-tape", { symbol: { nested: true } }))
      .toThrow(/must be primitive/);
  });

  it("builds the economic calendar, timeline, and technical analysis display configs", () => {
    expect(buildEconomicCalendarConfig()).toMatchObject({
      colorTheme: "dark",
      isTransparent: false,
      locale: "en",
    });
    expect(buildTimelineConfig()).toMatchObject({
      feedMode: "market",
      market: "stock",
      colorTheme: "dark",
      isTransparent: false,
      locale: "en",
    });
    expect(buildTechnicalAnalysisConfig("FX:EURUSD")).toMatchObject({
      symbol: "FX:EURUSD",
      interval: "1D",
      colorTheme: "dark",
      isTransparent: false,
      locale: "en",
    });
  });

  it("strictly limits non-ticker arrays and rejects non-JSON config values", () => {
    expect(() => assertTradingViewWidgetConfig("events", { filters: [{ key: "value" }] })).toThrow();
    expect(() => assertTradingViewWidgetConfig("events", { callback: () => {} })).toThrow();
    expect(() => assertTradingViewWidgetConfig("events", { amount: Number.NaN })).toThrow();
  });

  it("prioritizes resolvable journal assets, then appends ticker tape symbols", () => {
    const options = buildTechnicalSymbolOptions(
      ["CFDs on Gold (US$ / OZ)", "EUR/USD", "Unmapped multi word asset"],
    );
    expect(options.slice(0, 2)).toEqual([
      { label: "CFDs on Gold (US$ / OZ)", symbol: "OANDA:XAUUSD" },
      { label: "EUR/USD", symbol: "FX:EURUSD" },
    ]);
    expect(options.some(({ label }) => label === "Unmapped multi word asset")).toBe(false);
    expect(options[2]).toEqual({ label: "GBPUSD", symbol: "FX:GBPUSD" });
    expect(buildTechnicalSymbolOptions(["Gold"], { Gold: "CUSTOM:XAUUSD" })[0])
      .toEqual({ label: "Gold", symbol: "CUSTOM:XAUUSD" });
  });
});
