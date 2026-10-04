export const emptyBacktestResult = {
  id: null,
  userId: null,
  strategyVersionId: null,
  asset: "",
  timeframe: "",
  session: "",
  startDate: "",
  endDate: "",
  config: {},
  metrics: {},
  trades: [],
  createdAt: null,
};

export function dbToBacktestResult(row = {}) {
  return {
    ...emptyBacktestResult,
    id: row.id ?? null,
    userId: row.user_id ?? null,
    strategyVersionId: row.strategy_version_id ?? null,
    asset: row.asset ?? "",
    timeframe: row.timeframe ?? "",
    session: row.session ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    config: row.config && typeof row.config === "object" ? row.config : {},
    metrics: row.metrics && typeof row.metrics === "object" ? row.metrics : {},
    trades: Array.isArray(row.trades) ? row.trades : [],
    createdAt: row.created_at ?? null,
  };
}

export function backtestResultToDb(result = {}) {
  return {
    user_id: result.userId ?? null,
    strategy_version_id: result.strategyVersionId ?? null,
    asset: String(result.asset ?? "").trim() || null,
    timeframe: result.timeframe || null,
    session: result.session || null,
    start_date: result.startDate || null,
    end_date: result.endDate || null,
    config: result.config && typeof result.config === "object" ? result.config : {},
    metrics: result.metrics && typeof result.metrics === "object" ? result.metrics : {},
    trades: Array.isArray(result.trades) ? result.trades : [],
  };
}
