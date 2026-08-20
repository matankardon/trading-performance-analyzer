export const strategyConditionCatalog = [
  { key: "liquiditySweep", label: "Liquidity Sweep" },
  { key: "mss", label: "MSS" },
  { key: "fvg", label: "FVG" },
  { key: "displacement", label: "Displacement" },
  { key: "orderBlock", label: "Order Block" },
  { key: "stochasticConfirmation", label: "Stochastic Confirmation" },
];

export const strategyStatuses = ["Draft", "Testing", "Validated", "Live", "Archived"];
export const strategyDirections = ["Long", "Short", "Both"];

function createConditions(overrides = {}) {
  return strategyConditionCatalog.map((condition) => {
    const value = overrides[condition.key];
    const legacyEnabled = typeof value === "boolean" ? value : false;

    return {
      key: condition.key,
      label: condition.label,
      enabled: typeof value === "object" ? Boolean(value.enabled) : legacyEnabled,
      required: typeof value === "object" ? value.required !== false : legacyEnabled,
      notes: typeof value === "object" ? value.notes || "" : "",
    };
  });
}

export function createStrategyDraft(overrides = {}) {
  return {
    name: "",
    description: "",
    asset: "",
    assets: "",
    timeframe: "",
    session: "",
    entryRules: "",
    exitRules: "",
    exitCondition: "",
    timeBasedExit: "",
    stopLossRules: "",
    takeProfitRules: "",
    riskReward: "",
    direction: "",
    status: "Draft",
    notes: "",
    ...overrides,
    conditions: Array.isArray(overrides.conditions)
      ? overrides.conditions.map((condition) => ({ ...condition }))
      : createConditions(overrides.conditions),
  };
}

export function createStrategyVersion(strategy, versionNumber = 1) {
  const draft = createStrategyDraft(strategy);

  return {
    id: `${strategy.name || "strategy"}-v${versionNumber}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    version: versionNumber,
    createdAt: new Date().toISOString(),
    ...draft,
  };
}

export function normalizeStrategy(strategy) {
  const versions = Array.isArray(strategy?.versions) ? strategy.versions : [];
  const normalizedVersions = versions.map((version, index) => createStrategyVersion(version, version.version || index + 1));
  const currentVersion = strategy?.currentVersion || normalizedVersions.at(-1)?.version || 1;
  const current = normalizedVersions.find((version) => version.version === currentVersion) || normalizedVersions.at(-1);

  return {
    ...createStrategyDraft(strategy),
    ...strategy,
    id: strategy?.id || `strategy-${Date.now()}`,
    asset: strategy?.asset || strategy?.assets || "",
    assets: strategy?.assets || strategy?.asset || "",
    conditions: createConditions(strategy?.conditions),
    versions: normalizedVersions.length ? normalizedVersions : [createStrategyVersion(strategy, currentVersion)],
    currentVersion: current?.version || currentVersion,
    updatedAt: strategy?.updatedAt || current?.createdAt || new Date().toISOString(),
  };
}

export function loadStrategyLibrary(userId) {
  if (!userId || typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(`tradeCatalystStrategies:${userId}`);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStrategy) : [];
  } catch (error) {
    console.error("Could not load strategy library:", error);
    return [];
  }
}

export function saveStrategyLibrary(userId, strategies) {
  if (!userId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(`tradeCatalystStrategies:${userId}`, JSON.stringify(strategies));
  } catch (error) {
    console.error("Could not save strategy library:", error);
  }
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
