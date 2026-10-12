import { describe, expect, it } from "vitest";
import { resolveChartSymbol, toTradingViewSymbol } from "./symbolMap";

describe("symbolMap", () => {
  it("maps common journal names to Massive-compatible chart tickers", () => {
    expect(resolveChartSymbol("CFDs on Gold (US$ / OZ)", {})).toBe("XAUUSD");
    expect(resolveChartSymbol("EUR/USD", {})).toBe("EURUSD");
    expect(resolveChartSymbol("NASDAQ", {})).toBe("NAS100");
    expect(resolveChartSymbol("S&P 500", {})).toBe("SPX");
    expect(resolveChartSymbol("AAPL", {})).toBe("AAPL");
    expect(resolveChartSymbol("SPY", {})).toBe("SPY");
    expect(resolveChartSymbol("C:EURUSD", {})).toBe("C:EURUSD");
  });

  it("prefers persisted user mappings and returns null for unknown assets", () => {
    expect(resolveChartSymbol("CFDs on Gold (US$ / OZ)", { "CFDs on Gold (US$ / OZ)": "XAUUSD" })).toBe("XAUUSD");
    expect(resolveChartSymbol("Random Story Stock", {})).toBeNull();
    expect(resolveChartSymbol("   ", {})).toBeNull();
  });

  it("maps TradingView aliases and plain tickers without substituting unresolved names", () => {
    expect(toTradingViewSymbol("CFDs on Gold (US$ / OZ)")).toBe("OANDA:XAUUSD");
    expect(toTradingViewSymbol("EUR/USD")).toBe("FX:EURUSD");
    expect(toTradingViewSymbol("NAS100")).toBe("OANDA:NAS100USD");
    expect(toTradingViewSymbol("US30")).toBe("OANDA:US30USD");
    expect(toTradingViewSymbol("SPX500")).toBe("OANDA:SPX500USD");
    expect(toTradingViewSymbol("BTCUSD")).toBe("BITSTAMP:BTCUSD");
    expect(toTradingViewSymbol("AAPL")).toBe("AAPL");
    expect(toTradingViewSymbol("C:EURUSD")).toBe("C:EURUSD");
    expect(toTradingViewSymbol("Random Story Stock")).toBeNull();
  });

  it("prefers user TradingView mappings", () => {
    expect(toTradingViewSymbol("Gold", { Gold: "CUSTOM:XAUUSD" })).toBe("CUSTOM:XAUUSD");
  });
});
