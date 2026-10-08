import { describe, expect, it } from "vitest";
import { postProcessTradeDraft, type DraftTradeAllowLists } from "./draftTrade";

const allowLists: DraftTradeAllowLists = {
  sessions: ["New York", "London", "Asia", "Overlap"],
  conditions: ["Liquidity Sweep", "MSS", "FVG", "Displacement", "Order Block", "Stochastic Confirmation"],
  indicators: ["SMA", "EMA", "RSI", "MACD", "Bollinger", "ADX", "Fibonacci", "Ichimoku", "StdDev"],
  strategies: [{ name: "Gold Setup", versions: [1, 2] }],
};

describe("postProcessTradeDraft", () => {
  it("keeps stated and allowed values while dropping unsupported values", () => {
    const message = "Log a trade: short gold, entry 2345, exit 2330, P&L -15, sweep + MSS, RSI, Gold Setup v2.";
    expect(postProcessTradeDraft({
      asset: "gold",
      direction: "Short",
      entry: 2345,
      exit: 2330,
      stopLoss: 2360,
      takeProfit: 2300,
      pnl: -15,
      date: "2026-10-07",
      session: "London",
      strategyName: "Gold Setup",
      versionNumber: 2,
      conditions: ["Liquidity Sweep", "MSS", "Order Block"],
      indicators: ["RSI", "MACD"],
    }, message, allowLists)).toEqual({
      asset: "gold",
      direction: "Short",
      entry: 2345,
      exit: 2330,
      stopLoss: null,
      takeProfit: null,
      pnl: -15,
      date: null,
      session: null,
      strategyName: "Gold Setup",
      versionNumber: 2,
      conditions: ["Liquidity Sweep", "MSS"],
      indicators: ["RSI"],
    });
  });

  it("does not infer unstated prices, P&L, direction, or date", () => {
    const message = "Log a trade: gold, entry X, exit Y, sweep + MSS";
    expect(postProcessTradeDraft({
      asset: "gold",
      direction: "Long",
      entry: 2345,
      exit: 2330,
      stopLoss: 2320,
      takeProfit: 2400,
      pnl: 15,
      date: "2026-10-07",
      session: "New York",
      strategyName: null,
      versionNumber: null,
      conditions: ["Liquidity Sweep", "MSS"],
      indicators: [],
    }, message, allowLists)).toMatchObject({
      direction: null,
      entry: null,
      exit: null,
      stopLoss: null,
      takeProfit: null,
      pnl: null,
      date: null,
      session: null,
    });
  });

  it("returns a complete null-safe shape for malformed model output", () => {
    expect(postProcessTradeDraft(null, "Log a trade", allowLists)).toEqual({
      asset: null,
      direction: null,
      entry: null,
      exit: null,
      stopLoss: null,
      takeProfit: null,
      pnl: null,
      date: null,
      session: null,
      strategyName: null,
      versionNumber: null,
      conditions: [],
      indicators: [],
    });
  });
});
