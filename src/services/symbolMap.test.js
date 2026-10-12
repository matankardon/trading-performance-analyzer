import { describe, expect, it } from "vitest";
import {
  readTradingViewSymbolMap,
  resolveChartSymbol,
  toTradingViewSymbol,
  tradingViewSymbolAlternatives,
  writeTradingViewSymbolMap,
} from "./symbolMap";

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

  it("returns the verified gold feed first and keeps fallback feeds in order", () => {
    expect(tradingViewSymbolAlternatives("CFDs on Gold (US$ / OZ)")).toEqual([
      "OANDA:XAUUSD",
      "TVC:GOLD",
      "FX_IDC:XAUUSD",
    ]);
  });

  it("passes typed exchange-prefixed symbols through without changing their case", () => {
    expect(toTradingViewSymbol("oanda:XAUUSD")).toBe("oanda:XAUUSD");
  });

  it("prefers user TradingView mappings", () => {
    expect(toTradingViewSymbol("Gold", { Gold: "CUSTOM:XAUUSD" })).toBe("CUSTOM:XAUUSD");
  });

  it("persists TradingView feed preferences in local storage", () => {
    expect(writeTradingViewSymbolMap({ Gold: "TVC:GOLD" })).toBe(true);
    expect(readTradingViewSymbolMap()).toEqual({ Gold: "TVC:GOLD" });
    expect(toTradingViewSymbol("Gold", readTradingViewSymbolMap())).toBe("TVC:GOLD");
  });
});
