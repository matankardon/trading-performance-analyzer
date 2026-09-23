export const emptyStrategy = {
  id: null,
  userId: null,
  name: "",
  description: "",
  assets: "",
  timeframe: "",
  session: "",
  direction: "",
  status: "Draft",
  notes: "",
  createdAt: null,
  versions: [],
};

export const emptyStrategyVersion = {
  id: null,
  strategyId: null,
  version: 1,
  entryRules: "",
  exitRules: "",
  stopLossRules: "",
  takeProfitRules: "",
  riskReward: "",
  conditions: {},
  createdAt: null,
};

export function dbToStrategyVersion(row = {}) {
  return {
    ...emptyStrategyVersion,
    id: row.id ?? null,
    strategyId: row.strategy_id ?? null,
    version: row.version_number ?? 1,
    entryRules: row.entry_rules ?? "",
    exitRules: row.exit_rules ?? "",
    stopLossRules: row.stop_loss_rules ?? "",
    takeProfitRules: row.take_profit_rules ?? "",
    riskReward: row.risk_reward ?? "",
    conditions: row.conditions && typeof row.conditions === "object" ? row.conditions : {},
    createdAt: row.created_at ?? null,
  };
}

export function strategyVersionToDb(version = {}) {
  return {
    strategy_id: version.strategyId,
    version_number: Number(version.version) || 1,
    entry_rules: version.entryRules || null,
    exit_rules: version.exitRules || null,
    stop_loss_rules: version.stopLossRules || null,
    take_profit_rules: version.takeProfitRules || null,
    risk_reward: version.riskReward || null,
    conditions: version.conditions || {},
  };
}

export function dbToStrategy(row = {}, versions = []) {
  return {
    ...emptyStrategy,
    id: row.id ?? null,
    userId: row.user_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    assets: row.assets ?? "",
    timeframe: row.timeframe ?? "",
    session: row.session ?? "",
    direction: row.direction ?? "",
    status: row.status ?? "Draft",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? null,
    versions,
  };
}

export function strategyToDb(strategy = {}) {
  return {
    user_id: strategy.userId ?? null,
    name: String(strategy.name ?? "").trim(),
    description: strategy.description || null,
    assets: strategy.assets || null,
    timeframe: strategy.timeframe || null,
    session: strategy.session || null,
    direction: strategy.direction || null,
    status: strategy.status || "Draft",
    notes: strategy.notes || null,
  };
}
