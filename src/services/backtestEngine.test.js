import { runBacktest, smaCrossover } from "./backtestEngine";

function bar(timestamp, open, high, low, close) {
  return { timestamp, open, high, low, close, volume: 100 };
}

describe("backtest engine", () => {
  it("enters on the next bar open and exits at take profit with risk-sized P&L", () => {
    const bars = [
      bar(1, 100, 101, 99, 100),
      bar(2, 105, 105, 104, 105),
      bar(3, 105, 111, 104, 110),
    ];
    const result = runBacktest({
      bars,
      entryRule: ({ index }) => index === 0,
      stopLossPct: 0.1,
      takeProfitPct: 0.05,
      riskPerTrade: 0.01,
      startingBalance: 10000,
      direction: "long",
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      entryPrice: 105,
      exitPrice: 110.25,
      exitReason: "take_profit",
    });
    expect(result.trades[0].positionSize).toBeCloseTo(9.5238095238, 6);
    expect(result.trades[0].pnl).toBeCloseTo(50, 6);
    expect(result.netPnl).toBeCloseTo(50, 6);
    expect(result.winRate).toBe(100);
    expect(result.profitFactor).toBe(Infinity);
    expect(result.expectancy).toBeCloseTo(50, 6);
    expect(result.maxDrawdown).toBe(0);
    expect(result.totalTrades).toBe(1);
    expect(result.equityCurve.at(-1).equity).toBeCloseTo(10050, 6);
  });

  it("takes the stop when both stop and target are touched in one bar", () => {
    const result = runBacktest({
      bars: [
        bar(1, 100, 100, 100, 100),
        bar(2, 100, 106, 94, 100),
        bar(3, 100, 100, 100, 100),
      ],
      entryRule: ({ index }) => index === 0,
      stopLossPct: 0.05,
      takeProfitPct: 0.05,
      riskPerTrade: 0.02,
      startingBalance: 10000,
      direction: "long",
    });

    expect(result.trades[0]).toMatchObject({ exitPrice: 95, exitReason: "stop_loss" });
    expect(result.netPnl).toBeCloseTo(-200, 6);
    expect(result.maxDrawdown).toBeCloseTo(200, 6);
  });

  it("supports short trades and closes an open position at end of data", () => {
    const result = runBacktest({
      bars: [bar(1, 100, 100, 100, 100), bar(2, 100, 100, 90, 95)],
      entryRule: ({ index }) => index === 0,
      stopLossPct: 0.1,
      takeProfitPct: 0.2,
      riskPerTrade: 0.01,
      startingBalance: 10000,
      direction: "short",
    });

    expect(result.trades[0]).toMatchObject({ exitPrice: 95, exitReason: "end_of_data" });
    expect(result.netPnl).toBeCloseTo(50, 6);
    expect(result.winRate).toBe(100);
  });

  it("emits a deterministic SMA crossover signal without using future bars", () => {
    const entryRule = smaCrossover(2, 3);
    const bars = [
      bar(1, 1, 1, 1, 1),
      bar(2, 1, 1, 1, 1),
      bar(3, 1, 1, 1, 1),
      bar(4, 1, 2, 1, 2),
    ];

    expect(entryRule({ bars, index: 2, direction: "long" })).toBe(false);
    expect(entryRule({ bars, index: 3, direction: "long" })).toBe(true);
  });
});