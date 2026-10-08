import { describe, expect, it } from "vitest";
import { buildCoachContext } from "./coachContext";

function trade(index, overrides = {}) {
  return {
    id: `trade-${index}`,
    userId: "user-private-id",
    date: "2026-10-07",
    direction: "Long",
    asset: "AAPL",
    session: "New York",
    pnl: 20,
    riskReward: 2,
    tradeQuality: "Valid Setup",
    ruleBreak: false,
    liquiditySweep: true,
    mss: false,
    fvg: false,
    displacement: false,
    orderBlock: false,
    stochasticConfirmation: false,
    indicators: ["SMA"],
    metrics: { drawdownUsd: 5, drawdownPct: 1, custom: [{ name: "R-multiple", value: 2 }] },
    strategyVersionId: "11111111-1111-4111-8111-111111111111",
    notes: "secret note should never enter context",
    screenshotPath: "https://private.invalid/chart.png",
    ...overrides,
  };
}

const strategies = [{
  id: "strategy-private-id",
  name: "Opening Range",
  notes: "private strategy note",
  versions: [{
    id: "11111111-1111-4111-8111-111111111111",
    version: 2,
    conditions: { liquiditySweep: true, smaConfirmation: true },
    latestBacktestSummary: {
      id: "backtest-private-id",
      strategyVersionId: "11111111-1111-4111-8111-111111111111",
      asset: "AAPL",
      timeframe: "5m",
      startDate: "2026-10-01",
      endDate: "2026-10-06",
      metrics: { totalTrades: 8, winRate: 50, netPnl: 100, profitFactor: 1.5, expectancy: 12.5 },
    },
  }],
}];

describe("buildCoachContext", () => {
  it("builds hand-checkable all-time, 7-day, and 30-day windows", () => {
    const context = buildCoachContext([
      trade(1, { date: "2026-10-07", pnl: 20 }),
      trade(2, { date: "2026-10-01", pnl: -10 }),
      trade(3, { date: "2026-09-08", pnl: 40 }),
      trade(4, { date: "2026-09-06", pnl: 100 }),
      trade(5, { date: "not-a-date", pnl: 5 }),
    ], strategies, "2026-10-07");

    expect(context.today).toBe("2026-10-07");
    expect(context.totalTrades).toBe(5);
    expect(context.windows.allTime.totalTrades).toBe(5);
    expect(context.windows.allTime.factors.find(({ key }) => key === "session").groups[0].netPnl).toBe(155);
    expect(context.windows.last7d.totalTrades).toBe(2);
    expect(context.windows.last30d.totalTrades).toBe(3);
    expect(context.strategies[0]).toMatchObject({
      strategy: "Opening Range",
      version: 2,
      declaredConditions: ["Liquidity Sweep"],
      declaredIndicators: ["SMA"],
      conditionEvidence: [
        { name: "Liquidity Sweep", kind: "setup", present: { n: 5, expectancy: 31 }, absent: { n: 0, expectancy: null } },
        { name: "SMA", kind: "indicator", present: { n: 5, expectancy: 31 }, absent: { n: 0, expectancy: null } },
      ],
      forwardStats: { tradeCount: 5, netPnl: 155 },
      latestBacktest: { asset: "AAPL", metrics: { tradeCount: 8, netPnl: 100 } },
      forwardVsBacktest: {
        winRate: 30,
        netPnl: 55,
        profitFactor: 15,
        expectancy: 18.5,
        maxDrawdown: null,
        averageRiskReward: null,
      },
    });
  });

  it("omits private fields and identifiers and sanitizes/caps all trade strings", () => {
    const context = buildCoachContext([trade(1, {
      asset: `AAPL\n${"X".repeat(100)} 11111111-1111-4111-8111-111111111111 user@example.com`,
      session: "New York\u0000\u0001",
    })], strategies, "2026-10-07");
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("secret note");
    expect(serialized).not.toContain("private.invalid");
    expect(serialized).not.toContain("user-private-id");
    expect(serialized).not.toContain("strategy-private-id");
    expect(serialized).not.toContain("backtest-private-id");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("11111111-1111-4111-8111-111111111111");
    const recentTrade = context.recentTrades[0];
    expect(recentTrade.asset.length).toBeLessThanOrEqual(60);
    expect([...recentTrade.session].every((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })).toBe(true);
    expect(recentTrade).not.toHaveProperty("id");
    expect(recentTrade).not.toHaveProperty("notes");
    expect(recentTrade).not.toHaveProperty("screenshotPath");
  });

  it("redacts URL and path-like journal text while keeping common FX symbols", () => {
    const context = buildCoachContext([
      trade(1, { asset: "https://private.invalid/chart.png" }),
      trade(2, { asset: "private/storage/chart.png" }),
      trade(3, { asset: "EUR/USD" }),
    ], [], "2026-10-07");
    expect(context.recentTrades.map(({ asset }) => asset)).toEqual(["[redacted]", "[redacted]", "EUR/USD"]);
    expect(JSON.stringify(context)).not.toMatch(/https?:\/\/|private\/storage/);
  });

  it("caps recent journal rows at 50, newest first", () => {
    const context = buildCoachContext(
      Array.from({ length: 65 }, (_, index) => {
        const date = new Date("2026-08-25T00:00:00.000Z");
        date.setUTCDate(date.getUTCDate() + index);
        return trade(index + 1, {
        date: date.toISOString().slice(0, 10),
        pnl: index,
        });
      }),
      [],
      "2026-10-28",
    );
    expect(context.recentTrades).toHaveLength(50);
    expect(context.recentTrades[0].pnl).toBe(64);
    expect(context.recentTrades.at(-1).pnl).toBe(15);
  });
});