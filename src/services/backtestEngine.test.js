import { calculateExpandedMetrics, runBacktest, smaCrossover } from "./backtestEngine";

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
      entryIndex: 1,
      exitIndex: 2,
      barsHeld: 1,
      calendarTimeHeldMs: 1,
      calendarTimeHeld: "1ms",
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

  it("reduces P&L for adverse entry and exit slippage plus round-trip commission", () => {
    const bars = [
      bar(1, 100, 100, 100, 100),
      bar(2, 100, 101, 99, 100),
      bar(3, 100, 106, 99, 105.5),
    ];
    const baseRequest = {
      bars,
      entryRule: ({ index }) => index === 0,
      stopLossPct: 0.1,
      takeProfitPct: 0.05,
      riskPerTrade: 0.01,
      startingBalance: 10000,
      direction: "long",
    };
    const noCostResult = runBacktest(baseRequest);
    const costResult = runBacktest({
      ...baseRequest,
      commissionPerTrade: 2,
      slippagePct: 0.001,
    });

    expect(noCostResult.trades[0].pnl).toBeCloseTo(50, 6);
    expect(costResult.trades[0].grossPnl).toBeCloseTo(48.95, 6);
    expect(costResult.trades[0].commission).toBe(2);
    expect(costResult.trades[0].pnl).toBeCloseTo(46.95, 6);
    expect(noCostResult.trades[0].pnl - costResult.trades[0].pnl).toBeCloseTo(3.05, 6);
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
    expect(result.trades[0].barsHeld).toBe(0);
    expect(result.trades[0].calendarTimeHeldMs).toBe(0);
    expect(result.trades[0].calendarTimeHeld).toBe("0ms");
    expect(result.netPnl).toBeCloseTo(50, 6);
    expect(result.winRate).toBe(100);
  });

  it("records one mark-to-market equity point per bar without duplicating the first timestamp", () => {
    const result = runBacktest({
      bars: [
        bar(1, 100, 100, 100, 100),
        bar(2, 100, 101, 99, 101),
        bar(3, 101, 103, 100, 102),
      ],
      entryRule: ({ index }) => index === 0,
      stopLossPct: 0.1,
      takeProfitPct: 0.2,
      riskPerTrade: 0.01,
      startingBalance: 1000,
      direction: "long",
    });

    expect(result.equityCurve).toEqual([
      { timestamp: 1, equity: 1000 },
      { timestamp: 2, equity: 1001 },
      { timestamp: 3, equity: 1002 },
    ]);
  });

  it("calculates additive return, trade distribution, time-in-market, and daily Sharpe metrics", () => {
    const dailyEquity = [1000];
    for (let index = 0; index < 30; index += 1) {
      dailyEquity.push(dailyEquity.at(-1) * (index % 2 === 0 ? 1.01 : 0.99));
    }
    const equityCurve = dailyEquity.map((equity, index) => ({
      timestamp: index * 86400000,
      equity,
    }));
    const metrics = calculateExpandedMetrics([
      { pnl: 100, entryIndex: 0, exitIndex: 1 },
      { pnl: -50, entryIndex: 2, exitIndex: 4 },
      { pnl: -25, entryIndex: 5, exitIndex: 5 },
      { pnl: 75, entryIndex: 6, exitIndex: 7 },
    ], equityCurve, 1000, 10);

    expect(metrics.returnPct).toBe(10);
    expect(metrics.averageWin).toBe(87.5);
    expect(metrics.averageLoss).toBe(-37.5);
    expect(metrics.winLossRatio).toBeCloseTo(2.333333, 6);
    expect(metrics.maxConsecutiveLosses).toBe(2);
    expect(metrics.largestWin).toBe(100);
    expect(metrics.largestLoss).toBe(-50);
    expect(metrics.timeInMarketPct).toBe(80);
    expect(metrics.sharpeRatio).toBeCloseTo(0, 10);
  });

  it("reports raw signals separately from signals suppressed by an open position", () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const result = runBacktest({
        bars: [
          bar(1, 100, 100, 100, 100),
          bar(2, 100, 101, 99, 101),
          bar(3, 101, 103, 100, 102),
        ],
        entryRule: () => true,
        stopLossPct: 0.1,
        takeProfitPct: 0.2,
        riskPerTrade: 0.01,
        startingBalance: 1000,
        direction: "long",
        debugSignals: true,
      });
      const [, diagnostics] = logSpy.mock.calls.find(([message]) => message === "[backtest] signal diagnostics");

      expect(result.totalTrades).toBe(1);
      expect(diagnostics).toEqual({
        rawSignalCount: 3,
        queuedSignalCount: 1,
        skippedWhilePositionOpen: 2,
        signalsWithoutNextBar: 0,
        tradesRecorded: 1,
      });
    } finally {
      logSpy.mockRestore();
    }
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