import { compareForwardToBacktest, computeAdherence, computeForwardStats } from "./forwardTestStats";

const version = {
  id: "version-1",
  conditions: { liquiditySweep: true, mss: true, smaConfirmation: true },
};

function trade(index, overrides = {}) {
  return {
    id: `trade-${index}`,
    strategyVersionId: "version-1",
    date: `2025-01-${String(index).padStart(2, "0")}`,
    time: "09:30",
    asset: "AAPL",
    pnl: 0,
    riskReward: 2,
    liquiditySweep: false,
    mss: false,
    indicators: [],
    ruleBreak: false,
    ...overrides,
  };
}

describe("forward test statistics", () => {
  it("returns safe zeroed statistics for no trades and excludes unlinked trades", () => {
    expect(computeForwardStats([])).toMatchObject({
      tradeCount: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netPnl: 0,
      profitFactor: 0,
      expectancy: 0,
      maxDrawdownUsd: 0,
      sufficient: false,
    });
    expect(computeForwardStats([trade(1), { ...trade(2), strategyVersionId: null }]).tradeCount).toBe(1);
  });

  it("calculates one trade and an all-wins infinite profit factor without NaN", () => {
    const single = computeForwardStats([trade(1, { pnl: 50, riskReward: 1.5 })]);
    expect(single).toMatchObject({ tradeCount: 1, wins: 1, losses: 0, winRate: 100, netPnl: 50, expectancy: 50, averageRiskReward: 1.5 });
    expect(single.profitFactor).toBe(Number.POSITIVE_INFINITY);

    const allWins = computeForwardStats([trade(1, { pnl: 20 }), trade(2, { pnl: 30 })]);
    expect(allWins.profitFactor).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(allWins.profitFactor)).toBe(false);
  });

  it("computes mixed results, loss streak, ordering, and cumulative drawdown by hand", () => {
    const result = computeForwardStats([
      trade(4, { date: "2025-01-04", pnl: 60, riskReward: 3 }),
      trade(2, { date: "2025-01-02", pnl: -40, riskReward: 1 }),
      trade(1, { date: "2025-01-01", pnl: 100, riskReward: 2 }),
      trade(3, { date: "2025-01-03", pnl: -80, riskReward: 1.5 }),
    ]);

    expect(result).toMatchObject({
      tradeCount: 4,
      wins: 2,
      losses: 2,
      winRate: 50,
      netPnl: 40,
      expectancy: 10,
      averageWin: 80,
      averageLoss: -60,
      largestWin: 100,
      largestLoss: -80,
      maxConsecutiveLosses: 2,
      maxDrawdownUsd: 120,
      averageRiskReward: 1.875,
    });
    expect(result.profitFactor).toBeCloseTo(4 / 3, 10);
    expect(result.equityCurve.map(({ cumulativePnl }) => cumulativePnl)).toEqual([100, 60, -20, 40]);
  });

  it("prefers recorded drawdown metrics when present", () => {
    const result = computeForwardStats([
      trade(1, { pnl: 10, metrics: { drawdownUsd: 75, drawdownPct: 12 } }),
      trade(2, { pnl: -5, metrics: { drawdownUsd: 40, drawdownPct: 4 } }),
    ]);
    expect(result.maxDrawdownUsd).toBe(75);
    expect(result.maxDrawdownPct).toBe(12);
  });

  it("calculates condition adherence and rule-break omissions hand-verified", () => {
    const result = computeAdherence([
      trade(1, { liquiditySweep: true, mss: true, indicators: ["SMA"] }),
      trade(2, { liquiditySweep: true, indicators: ["SMA"] }),
      trade(3, { mss: true, ruleBreak: true }),
      { ...trade(4), strategyVersionId: null, liquiditySweep: true, mss: true, indicators: ["SMA"] },
    ], version);

    expect(result.tradeCount).toBe(3);
    result.conditions.forEach(({ percentage }) => expect(percentage).toBeCloseTo(200 / 3, 10));
    expect(result.fullyAdherentCount).toBe(1);
    expect(result.fullyAdherentPercentage).toBeCloseTo(100 / 3, 10);
    expect(result.missingTrades).toEqual([
      expect.objectContaining({ id: "trade-2", missingConditions: ["MSS"], ruleBreak: false }),
      expect.objectContaining({ id: "trade-3", missingConditions: ["Liquidity Sweep", "SMA"], ruleBreak: true }),
    ]);
  });

  it("returns null comparisons when no backtest exists and returns forward/backtest deltas otherwise", () => {
    const forward = computeForwardStats([trade(1, { pnl: 10, riskReward: 2 })]);
    expect(compareForwardToBacktest(forward, null)).toBeNull();

    const comparison = compareForwardToBacktest(forward, {
      metrics: { winRate: 50, profitFactor: 1.5, expectancy: 5 },
      trades: [{ entryPrice: 100, stopLoss: 95, takeProfit: 110 }],
    });
    expect(comparison).toMatchObject([
      { key: "winRate", forward: 100, backtest: 50, delta: 50 },
      { key: "profitFactor", forward: Number.POSITIVE_INFINITY, backtest: 1.5, delta: null },
      { key: "expectancy", forward: 10, backtest: 5, delta: 5 },
      { key: "averageRiskReward", forward: 2, backtest: 2, delta: 0 },
    ]);
  });
});
