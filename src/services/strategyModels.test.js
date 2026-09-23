import {
  createBacktestRequest,
  createStrategyDraft,
  createStrategyVersion,
  strategyConditionCatalog,
} from "./strategyModels";

describe("strategy models", () => {
  it("creates a draft with every catalog condition disabled by default", () => {
    const draft = createStrategyDraft();

    expect(draft.status).toBe("Draft");
    expect(draft.conditions).toEqual(
      Object.fromEntries(
        strategyConditionCatalog.map(({ key }) => [key, false])
      )
    );
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
      startingBalance: "",
    });
  });
});