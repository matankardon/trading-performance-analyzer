import { describe, expect, it } from "vitest";
import { resolveChartSymbol } from "./symbolMap";

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
});
