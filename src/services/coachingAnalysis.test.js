import { describe, expect, it } from "vitest";
import {
  analyzeCoaching,
  generateInsights,
  groupStats,
  rankCombos,
  ruleBreakCost,
  toCoachSummaryAnalysis,
} from "./coachingAnalysis";

function sampleTrades(pnls, overrides = {}) {
  return pnls.map((pnl, index) => ({
    id: `trade-${index + 1}`,
    date: "2026-10-05",
    pnl,
    riskReward: index % 2 ? "" : 2,
    session: "New York",
    liquiditySweep: true,
    indicators: ["RSI"],
    tradeQuality: "Valid Setup",
    ruleBreak: false,
    ...overrides,
  }));
}

describe("coaching analysis", () => {
  it("returns finite, safe summaries for empty input", () => {
    expect(groupStats([], () => "all")).toEqual([]);
    expect(ruleBreakCost([])).toEqual({
      ruleBreak: { n: 0, averagePnl: null, totalPnl: 0, lowSample: true },
      clean: { n: 0, averagePnl: null, totalPnl: 0, lowSample: true },
      averagePnlDifference: null,
      totalPnlDifference: null,
    });
    const analysis = analyzeCoaching([]);
    expect(analysis.totalTrades).toBe(0);
    expect(analysis.insights).toEqual([]);
    expect(analysis.sampleNotice).toContain("0 trades logged");
    expect(JSON.stringify(analysis)).not.toMatch(/NaN|Infinity/);
  });

  it("computes hand-verified grouped statistics and ignores missing R:R values", () => {
    const groups = groupStats([
      { pnl: 100, riskReward: 2 },
      { pnl: -40, riskReward: null },
      { pnl: 0, riskReward: 4 },
    ], () => "setup");
    expect(groups[0]).toMatchObject({
      key: "setup",
      n: 3,
      netPnl: 60,
      expectancy: 20,
      profitFactor: 2.5,
      averageRiskReward: 3,
      lowSample: true,
    });
  });

  it("excludes below-sample groups from insights and includes sample evidence", () => {
    const trades = [
      ...sampleTrades([10, 10, 10, 10], { session: "London" }),
      ...sampleTrades([20, 20, 20, 20, 20], { session: "New York" }),
    ];
    const analysis = analyzeCoaching(trades);
    expect(analysis.insights.some(({ text }) => text.includes("Day of week"))).toBe(false);
    expect(analysis.insights.every(({ text }) => !text.includes("London"))).toBe(true);
    expect(analysis.factors.find(({ key }) => key === "session").groups)
      .toEqual(expect.arrayContaining([expect.objectContaining({ n: 4, lowSample: true })]));
  });

  it("computes rule-break versus clean averages and totals", () => {
    const trades = [
      ...sampleTrades([10, -2, 0], { ruleBreak: true }),
      ...sampleTrades([20, 30], { ruleBreak: false }),
      ...sampleTrades([500], { ruleBreak: null }),
    ];
    expect(ruleBreakCost(trades)).toEqual({
      ruleBreak: { n: 3, averagePnl: 8 / 3, totalPnl: 8, lowSample: true },
      clean: { n: 2, averagePnl: 25, totalPnl: 50, lowSample: true },
      averagePnlDifference: 8 / 3 - 25,
      totalPnlDifference: -42,
    });
  });

  it("ranks combinations by expectancy and keeps only sufficiently sampled combinations", () => {
    const trades = [
      ...sampleTrades([10, 10, 10, 10, 10], { mss: true, liquiditySweep: true, indicators: [] }),
      ...sampleTrades([-5, -5, -5, -5, -5], { mss: true, fvg: true, liquiditySweep: false, indicators: [] }),
      ...sampleTrades([100, 100], { liquiditySweep: true, fvg: true, indicators: [] }),
    ];
    const ranked = rankCombos(trades);
    expect(ranked.best[0]).toMatchObject({
      key: "Liquidity Sweep + MSS",
      n: 5,
      expectancy: 10,
    });
    expect(ranked.worst[0]).toMatchObject({
      key: "MSS + FVG",
      n: 5,
      expectancy: -5,
    });
    expect(ranked.best.every(({ n }) => n >= 5)).toBe(true);
  });

  it("marks no-loss profit factor as n/a and has no non-finite metrics", () => {
    const groups = groupStats([{ pnl: 10 }, { pnl: 5 }], () => "wins");
    expect(groups[0].profitFactor).toBe("n/a");
    expect(groupStats([{ pnl: -10 }, { pnl: -30 }], () => "losses")[0]).toMatchObject({
      n: 2,
      winRate: 0,
      netPnl: -40,
      expectancy: -20,
      profitFactor: 0,
    });
    const analysis = analyzeCoaching([{ pnl: "invalid", indicators: null }]);
    expect(JSON.stringify(analysis)).not.toMatch(/NaN|Infinity/);
  });

  it("produces evidence-based templated insights", () => {
    const analysis = {
      factors: [{
        label: "MSS",
        dimension: "setup",
        groups: [
          { key: "Present", n: 6, expectancy: 30 },
          { key: "Absent", n: 7, expectancy: -10 },
        ],
      }],
    };
    expect(generateInsights(analysis)[0].text)
      .toBe("Trades with MSS averaged $30.00 per trade vs -$10.00 without (n=6 vs 7).");

    analysis.factors[0].groups.find(({ key }) => key === "Present").expectancy = -10;
    analysis.factors[0].groups.find(({ key }) => key === "Absent").expectancy = 30;
    expect(generateInsights(analysis)[0].text)
      .toBe("Trades with MSS averaged -$10.00 per trade vs $30.00 without (n=6 vs 7).");
  });

  it("returns only the five largest insights and removes the small-sample notice at 30 trades", () => {
    const factors = Array.from({ length: 7 }, (_, index) => ({
      key: `factor-${index}`,
      label: `Factor ${index}`,
      groups: [
        { key: "yes", n: 5, expectancy: index + 1 },
        { key: "no", n: 5, expectancy: 0 },
      ],
    }));
    expect(generateInsights({ factors })).toHaveLength(5);
    expect(generateInsights({ factors })[0].effectSize).toBe(7);
    expect(analyzeCoaching(Array.from({ length: 30 }, (_, index) => ({ pnl: index }))).sampleNotice).toBeNull();
  });

  it("projects aggregates without raw trade data, arbitrary labels, or strategy identifiers", () => {
    const strategyId = "strategy-version-secret-id";
    const analysis = analyzeCoaching([
      ...sampleTrades([10, 12, 14, 16, 18], { strategyVersionId: strategyId, session: "Custom private label" }),
      ...sampleTrades([-1, -2, -3, -4, -5], { strategyVersionId: "another-version-id", session: "Private session" }),
    ]);
    const payload = toCoachSummaryAnalysis(analysis, {
      from: "2026-01-01",
      to: "2026-01-31",
      strategyVersionFiltered: false,
    });
    const serialized = JSON.stringify(payload);

    expect(payload.filterRange).toEqual({ from: "2026-01-01", to: "2026-01-31", strategyVersionFiltered: false });
    expect(serialized).not.toContain(strategyId);
    expect(serialized).not.toContain("another-version-id");
    expect(serialized).not.toContain("Custom private label");
    expect(serialized).not.toContain("Private session");
    expect(serialized).not.toContain('"id"');
    expect(serialized).not.toContain('"pnl"');
    expect(payload.factors.find(({ key }) => key === "strategyVersion").groups.map(({ key }) => key))
      .toEqual(["Version A", "Version B"]);
  });
});
