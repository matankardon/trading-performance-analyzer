export const emptyTrade = {
  id: null,
  userId: null,
  createdAt: null,
  date: "",
  asset: "",
  direction: "Long",
  entry: "",
  exit: "",
  stopLoss: "",
  takeProfit: "",
  pnl: "",
  positionSize: "",
  riskReward: "",
  time: "",
  timeframe: "",
  strategy: "",
  strategyVersionId: null,
  session: "New York",
  notes: "",
  liquiditySweep: false,
  mss: false,
  fvg: false,
  displacement: false,
  orderBlock: false,
  stochasticConfirmation: false,
  tradeQuality: "Valid Setup",
  ruleBreak: false,
  screenshotPath: null,
  aiExtraction: null,
};

const numericFields = [
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "pnl",
  "positionSize",
  "riskReward",
];

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function dbToTrade(row = {}) {
  const trade = {
    ...emptyTrade,
    id: row.id ?? null,
    userId: row.user_id ?? null,
    createdAt: row.created_at ?? null,
    date: row.date ?? "",
    asset: row.asset ?? "",
    direction: row.direction ?? "Long",
    strategy: row.strategy ?? "",
    strategyVersionId: row.strategy_version_id ?? null,
    session: row.session ?? "New York",
    notes: row.notes ?? "",
    time: row.trade_time ?? "",
    timeframe: row.timeframe ?? "",
    liquiditySweep: Boolean(row.liquidity_sweep),
    mss: Boolean(row.mss),
    fvg: Boolean(row.fvg),
    displacement: Boolean(row.displacement),
    orderBlock: Boolean(row.order_block),
    stochasticConfirmation: Boolean(row.stochastic_confirmation),
    tradeQuality: row.trade_quality ?? "Valid Setup",
    ruleBreak: Boolean(row.rule_break),
    screenshotPath: row.screenshot_path ?? null,
    aiExtraction: row.ai_extraction ?? null,
  };

  numericFields.forEach((field) => {
    const dbField = field === "stopLoss"
      ? "stop_loss"
      : field === "takeProfit"
        ? "take_profit"
        : field === "positionSize"
          ? "position_size"
          : field === "riskReward"
            ? "risk_reward"
            : field;
    trade[field] = nullableNumber(row[dbField]);
  });

  return trade;
}

export function tradeToDb(trade = {}) {
  return {
    user_id: trade.userId ?? null,
    date: trade.date || null,
    asset: String(trade.asset ?? "").trim(),
    direction: trade.direction || null,
    entry: nullableNumber(trade.entry),
    exit: nullableNumber(trade.exit),
    stop_loss: nullableNumber(trade.stopLoss),
    take_profit: nullableNumber(trade.takeProfit),
    pnl: trade.pnl === "" || trade.pnl === null || trade.pnl === undefined ? 0 : nullableNumber(trade.pnl),
    position_size: nullableNumber(trade.positionSize),
    risk_reward: nullableNumber(trade.riskReward),
    trade_time: trade.time || null,
    timeframe: trade.timeframe || null,
    strategy: trade.strategy || null,
    strategy_version_id: trade.strategyVersionId ?? null,
    session: trade.session || "New York",
    notes: trade.notes || null,
    liquidity_sweep: Boolean(trade.liquiditySweep),
    mss: Boolean(trade.mss),
    fvg: Boolean(trade.fvg),
    displacement: Boolean(trade.displacement),
    order_block: Boolean(trade.orderBlock),
    stochastic_confirmation: Boolean(trade.stochasticConfirmation),
    trade_quality: trade.tradeQuality || "Valid Setup",
    rule_break: Boolean(trade.ruleBreak),
    screenshot_path: trade.screenshotPath ?? null,
    ai_extraction: trade.aiExtraction ?? null,
  };
}
