export const strategyConditionCatalog = [
  { key: "liquiditySweep", label: "Liquidity Sweep" },
  { key: "mss", label: "MSS" },
  { key: "fvg", label: "FVG" },
  { key: "displacement", label: "Displacement" },
  { key: "orderBlock", label: "Order Block" },
  { key: "stochasticConfirmation", label: "Stochastic Confirmation" },
];

export const strategyStatuses = ["Draft", "Testing", "Validated", "Live", "Archived"];

export function createStrategyDraft(overrides = {}) {
  return {
    name: "",
    description: "",
    assets: "",
    timeframe: "",
    session: "",
    entryRules: "",
    exitRules: "",
    stopLossRules: "",
    takeProfitRules: "",
    riskReward: "",
    direction: "",
    conditions: strategyConditionCatalog.reduce((result, condition) => ({ ...result, [condition.key]: false }), {}),
    status: "Draft",
    notes: "",
    ...overrides,
  };
}

export function createStrategyVersion(strategy, versionNumber = 1) {
  return {
    id: `${strategy.name || "strategy"}-v${versionNumber}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    version: versionNumber,
    createdAt: new Date().toISOString(),
    ...strategy,
  };
}

export function createBacktestRequest() {
  return {
    strategyId: "",
    versionId: "",
    asset: "",
    timeframe: "",
    startDate: "",
    endDate: "",
    session: "",
    riskPerTrade: "",
    startingBalance: "",
  };
}
