import {
  createBacktestRequest,
  createStrategyDraft,
  createStrategyVersion,
  indicatorConditionCatalog,
  strategyConditionCatalog,
} from "./strategyModels";

describe("strategy models", () => {
  it("creates a draft with every catalog condition disabled by default", () => {
    const draft = createStrategyDraft();

    expect(draft.status).toBe("Draft");
    expect(Object.fromEntries(strategyConditionCatalog.map(({ key }) => [key, draft.conditions[key]])))
      .toEqual(Object.fromEntries(strategyConditionCatalog.map(({ key }) => [key, false])));
    expect(Object.keys(draft.conditions.indicatorSettings)).toEqual(indicatorConditionCatalog.map(({ key }) => key));
    expect(draft.conditions.indicatorSettings.rsiConfirmation).toMatchObject({ period: 14, oversold: 30, overbought: 70 });
    expect(draft.name).toBe("");
  });

  it("applies draft overrides without losing default fields", () => {
    const draft = createStrategyDraft({
      name: "London Sweep",
      status: "Testing",
      conditions: { liquiditySweep: true },
    });

    expect(draft).toMatchObject({
      name: "London Sweep",
      status: "Testing",
      conditions: { liquiditySweep: true },
    });
    expect(draft.timeframe).toBe("");
  });

  it("creates a normalized version identifier and timestamp", () => {
    const version = createStrategyVersion(
      { name: "NY Liquidity / Reversal" },
      2
    );

    expect(version.id).toBe("ny-liquidity-reversal-v2");
    expect(version.version).toBe(2);
    expect(version.createdAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(version.createdAt))).toBe(false);
  });

  it("creates an empty backtest request", () => {
    expect(createBacktestRequest()).toEqual({
      strategyId: "",
      versionId: "",
      asset: "",
      timeframe: "",
      startDate: "",
      endDate: "",
      session: "",
      riskPerTrade: "",
      riskMode: "percent",
      startingBalance: "",
      stopLossPct: "2",
      riskRewardRatio: "2",
      commissionPerTrade: "1",
      slippagePct: "0.05",
      swingSize: "2",
      sweepDetectionLookback: "5",
      sweepLookback: "10",
      setupLookback: "20",
      stochasticKPeriod: "14",
      stochasticDPeriod: "3",
    });
  });
});