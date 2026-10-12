import { describe, expect, it } from "vitest";
import { calculateTradePlan } from "./tradePlan";

describe("calculateTradePlan", () => {
  it("computes long and short risk/reward and size", () => {
    expect(calculateTradePlan({ direction: "Long", entry: 100, stopLoss: 95, takeProfit: 110, riskAmount: 50 }))
      .toEqual({ riskReward: 2, riskPerTrade: 50, stopDistance: 5, suggestedPositionSize: 10 });
    expect(calculateTradePlan({ direction: "Short", entry: 100, stopLoss: 105, takeProfit: 90, riskAmount: 25 }))
      .toEqual({ riskReward: 2, riskPerTrade: 25, stopDistance: 5, suggestedPositionSize: 5 });
  });

  it("computes percentage risk and returns nulls for invalid or missing values", () => {
    expect(calculateTradePlan({ direction: "Long", entry: 100, stopLoss: 95, takeProfit: 105, riskAmount: 1, riskType: "percent", accountBalance: 10000 }))
      .toEqual({ riskReward: 1, riskPerTrade: 100, stopDistance: 5, suggestedPositionSize: 20 });
    expect(calculateTradePlan({ direction: "Long", entry: 100, stopLoss: 100, takeProfit: 110, riskAmount: 50 }))
      .toEqual({ riskReward: null, riskPerTrade: 50, stopDistance: null, suggestedPositionSize: null });
    expect(calculateTradePlan({ direction: "Long", entry: "invalid", riskAmount: 0 }))
      .toEqual({ riskReward: null, riskPerTrade: null, stopDistance: null, suggestedPositionSize: null });
  });
});
