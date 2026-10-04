import { buildBacktestConfig } from "./backtestConfig";

const baseRequest = {
  asset: "aapl",
  timeframe: "15m",
  startDate: "2024-01-01",
  endDate: "2024-01-31",
  session: "All sessions",
  riskPerTrade: "5",
  startingBalance: "10000",
  stopLossPct: "2",
  riskRewardRatio: "1.5",
  commissionPerTrade: "1",
  slippagePct: "0.05",
  swingSize: "2",
  sweepDetectionLookback: "5",
  sweepLookback: "10",
  setupLookback: "20",
  stochasticKPeriod: "14",
  stochasticDPeriod: "3",
};

const version = {
  direction: "Long",
  conditions: {
    liquiditySweep: true,
    mss: true,
    fvg: true,
    displacement: false,
    orderBlock: true,
    stochasticConfirmation: true,
  },
};

describe("buildBacktestConfig", () => {
  it("maps defaults and converts user units to engine units", () => {
    const config = buildBacktestConfig(baseRequest, version);

    expect(config.historicalRequest).toEqual({
      asset: "AAPL",
      timeframe: "15m",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(config.engine).toMatchObject({
      riskPerTrade: 0.05,
      startingBalance: 10000,
      stopLossPct: 0.02,
      takeProfitPct: 0.03,
      commissionPerTrade: 1,
      slippagePct: 0.0005,
      direction: "long",
    });
    expect(config.entryRuleOptions).toMatchObject({
      requireSweep: true,
      requireMss: true,
      requireFvg: true,
      requireDisplacement: false,
      requireOrderBlock: true,
      requireStoch: true,
      session: "All sessions",
      swingSize: 2,
      sweepDetectionLookback: 5,
      sweepLookback: 10,
      setupLookback: 20,
      stochasticKPeriod: 14,
      stochasticDPeriod: 3,
    });
  });

  it.each([
    ["asset", "MSFT", "historicalRequest", "asset", "MSFT"],
    ["timeframe", "1h", "historicalRequest", "timeframe", "1h"],
    ["startDate", "2024-02-01", "historicalRequest", "startDate", "2024-02-01"],
    ["endDate", "2024-02-29", "historicalRequest", "endDate", "2024-02-29"],
    ["session", "New York", "entryRuleOptions", "session", "New York"],
    ["riskPerTrade", "2", "engine", "riskPerTrade", 0.02],
    ["startingBalance", "25000", "engine", "startingBalance", 25000],
    ["stopLossPct", "1", "engine", "stopLossPct", 0.01],
    ["riskRewardRatio", "2.5", "engine", "takeProfitPct", 0.05],
    ["commissionPerTrade", "2.5", "engine", "commissionPerTrade", 2.5],
    ["slippagePct", "0.1", "engine", "slippagePct", 0.001],
    ["swingSize", "3", "entryRuleOptions", "swingSize", 3],
    ["sweepDetectionLookback", "7", "entryRuleOptions", "sweepDetectionLookback", 7],
    ["sweepLookback", "12", "entryRuleOptions", "sweepLookback", 12],
    ["setupLookback", "25", "entryRuleOptions", "setupLookback", 25],
    ["stochasticKPeriod", "10", "entryRuleOptions", "stochasticKPeriod", 10],
    ["stochasticDPeriod", "4", "entryRuleOptions", "stochasticDPeriod", 4],
  ])("maps changing %s only", (field, value, target, key, expected) => {
    const config = buildBacktestConfig({ ...baseRequest, [field]: value }, version);
    expect(config[target][key]).toBe(expected);
  });

  it("uses the selected version conditions and direction, not another version", () => {
    const otherVersion = { direction: "Short", conditions: { mss: false, fvg: false } };
    const config = buildBacktestConfig(baseRequest, { ...version, direction: "Both", conditions: version.conditions });

    expect(config.engine.direction).toBe("both");
    expect(config.entryRuleOptions.requireMss).toBe(true);
    expect(config.entryRuleOptions.requireFvg).toBe(true);
    expect(buildBacktestConfig(baseRequest, otherVersion).engine.direction).toBe("short");
    expect(buildBacktestConfig(baseRequest, otherVersion).entryRuleOptions.requireMss).toBe(false);
  });

  it.each(["liquiditySweep", "mss", "fvg", "displacement", "orderBlock", "stochasticConfirmation"]) (
    "maps condition flag %s independently",
    (condition) => {
      const config = buildBacktestConfig(baseRequest, { conditions: { [condition]: true } });
      expect(config.entryRuleOptions[`require${condition === "liquiditySweep" ? "Sweep" : condition === "stochasticConfirmation" ? "Stoch" : condition[0].toUpperCase() + condition.slice(1)}`]).toBe(true);
    },
  );
});