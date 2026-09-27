import { calculateTakeProfitPercent } from "./backtestParameters";

describe("backtest percentage parameters", () => {
  it.each([
    [2, 1.5, 3],
    [1, 2, 2],
    [0.5, 3, 1.5],
  ])("calculates %s%% stop-loss at %s R:R as %s%% take-profit", (stopLoss, ratio, expected) => {
    expect(calculateTakeProfitPercent(stopLoss, ratio)).toBe(expected);
  });
});