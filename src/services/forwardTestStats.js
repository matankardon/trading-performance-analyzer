import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";
import { calculateExpandedMetrics } from "./backtestEngine";

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pnlValue(trade) {
  return finiteNumber(trade.pnl) ?? 0;
}

function tradeVersionId(trade) {
  return trade.strategyVersionId ?? trade.strategy_version_id ?? null;
}

function tradeOrderValue(trade) {
  const date = String(trade.date ?? "").trim();
  const time = String(trade.time ?? "").trim();
  const combined = date && time ? new Date(`${date}T${time}`) : null;
  if (combined && Number.isFinite(combined.getTime())) return combined.getTime();
  const dateOnly = date ? new Date(date) : null;
  if (dateOnly && Number.isFinite(dateOnly.getTime())) return dateOnly.getTime();
  const createdAt = trade.createdAt ? new Date(trade.createdAt) : null;
  return createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : Number.POSITIVE_INFINITY;
}

function orderedVersionTrades(trades) {
  return (Array.isArray(trades) ? trades : [])
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => tradeVersionId(trade))
    .sort((left, right) => tradeOrderValue(left.trade) - tradeOrderValue(right.trade) || left.index - right.index)
    .map(({ trade }) => ({ ...trade, pnl: pnlValue(trade) }));
}

function cumulativeCurve(trades) {
  let cumulativePnl = 0;
  return trades.map((trade, index) => {
    cumulativePnl += trade.pnl;
    const date = String(trade.date ?? "").trim();
    const time = String(trade.time ?? "").trim();
    return {
      tradeNumber: index + 1,
      label: [date, time].filter(Boolean).join(" ") || `Trade ${index + 1}`,
      cumulativePnl,
    };
  });
}

function derivedDrawdown(curve) {
  let peak = 0;
  let maxDrawdown = 0;
  curve.forEach(({ cumulativePnl }) => {
    peak = Math.max(peak, cumulativePnl);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulativePnl);
  });
  return maxDrawdown;
}

function journaledMaximum(trades, field) {
  const recordedValues = trades
    .map((trade) => finiteNumber(trade.metrics?.[field]))
    .filter((value) => value !== null)
    .map(Math.abs);
  return recordedValues.length ? Math.max(...recordedValues) : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function computeForwardStats(trades) {
  const orderedTrades = orderedVersionTrades(trades);
  const tradeCount = orderedTrades.length;
  const wins = orderedTrades.filter((trade) => trade.pnl > 0);
  const losses = orderedTrades.filter((trade) => trade.pnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = losses.reduce((sum, trade) => sum + Math.abs(trade.pnl), 0);
  const netPnl = orderedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
  const equityCurve = cumulativeCurve(orderedTrades);
  const expanded = calculateExpandedMetrics(
    orderedTrades.map((trade) => ({ ...trade, entryIndex: 0, exitIndex: 0 })),
    [],
    0,
    1,
  );
  const riskRewards = orderedTrades
    .map((trade) => finiteNumber(trade.riskReward))
    .filter((value) => value !== null);
  const journaledDrawdown = journaledMaximum(orderedTrades, "drawdownUsd");
  const journaledDrawdownPct = journaledMaximum(orderedTrades, "drawdownPct");

  return {
    tradeCount,
    wins: wins.length,
    losses: losses.length,
    winRate: tradeCount ? (wins.length / tradeCount) * 100 : 0,
    netPnl,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Number.POSITIVE_INFINITY : 0,
    expectancy: tradeCount ? netPnl / tradeCount : 0,
    averageWin: expanded.averageWin,
    averageLoss: expanded.averageLoss,
    largestWin: expanded.largestWin,
    largestLoss: expanded.largestLoss,
    maxConsecutiveLosses: expanded.maxConsecutiveLosses,
    maxDrawdownUsd: journaledDrawdown ?? derivedDrawdown(equityCurve),
    maxDrawdownPct: journaledDrawdownPct,
    averageRiskReward: riskRewards.length ? average(riskRewards) : null,
    sufficient: tradeCount >= 30,
    equityCurve,
    orderedTrades,
  };
}

function declaredConditions(strategyVersion) {
  const conditions = strategyVersion?.conditions || {};
  return [
    ...SETUP_CONDITIONS.filter(({ key }) => conditions[key]).map(({ key, label }) => ({ key, label, type: "setup" })),
    ...INDICATORS.filter(({ key }) => conditions[key]).map(({ key, name, label }) => ({ key, name, label, type: "indicator" })),
  ];
}

function hasCondition(trade, condition) {
  if (condition.type === "indicator") {
    return Array.isArray(trade.indicators) && trade.indicators.includes(condition.name);
  }
  return trade[condition.key] === true;
}

export function computeAdherence(trades, strategyVersion) {
  const versionId = strategyVersion?.id;
  const versionTrades = orderedVersionTrades(trades)
    .filter((trade) => !versionId || tradeVersionId(trade) === versionId);
  const conditions = declaredConditions(strategyVersion);
  const evaluations = versionTrades.map((trade, index) => {
    const missingConditions = conditions
      .filter((condition) => !hasCondition(trade, condition))
      .map(({ label }) => label);
    const ruleBreak = Boolean(trade.ruleBreak);
    return {
      id: trade.id ?? `${trade.asset || "trade"}-${index + 1}`,
      date: trade.date || "",
      time: trade.time || "",
      asset: trade.asset || "",
      missingConditions,
      ruleBreak,
    };
  });
  const missingTrades = evaluations.filter(({ missingConditions, ruleBreak }) => missingConditions.length > 0 || ruleBreak);
  const fullyAdherentCount = evaluations.filter(({ missingConditions }) => missingConditions.length === 0).length;

  return {
    tradeCount: versionTrades.length,
    conditions: conditions.map((condition) => {
      const checkedCount = versionTrades.filter((trade) => hasCondition(trade, condition)).length;
      return {
        key: condition.key,
        label: condition.label,
        checkedCount,
        percentage: versionTrades.length ? (checkedCount / versionTrades.length) * 100 : 0,
      };
    }),
    fullyAdherentCount,
    fullyAdherentPercentage: versionTrades.length ? (fullyAdherentCount / versionTrades.length) * 100 : 0,
    missingTrades,
  };
}

function backtestAverageRiskReward(backtest) {
  const values = (Array.isArray(backtest?.trades) ? backtest.trades : []).map((trade) => {
    const entry = finiteNumber(trade.entryPrice ?? trade.entry);
    const stop = finiteNumber(trade.stopLoss ?? trade.stop_loss);
    const target = finiteNumber(trade.takeProfit ?? trade.take_profit);
    if (entry === null || stop === null || target === null) return null;
    const risk = Math.abs(entry - stop);
    return risk ? Math.abs(target - entry) / risk : null;
  }).filter((value) => value !== null);
  if (values.length) return average(values);

  const config = backtest?.config?.engine || {};
  const stopLossPct = finiteNumber(config.stopLossPct);
  const takeProfitPct = finiteNumber(config.takeProfitPct);
  return stopLossPct && takeProfitPct ? takeProfitPct / stopLossPct : null;
}

function metricDelta(forwardValue, backtestValue) {
  return Number.isFinite(forwardValue) && Number.isFinite(backtestValue)
    ? forwardValue - backtestValue
    : null;
}

export function compareForwardToBacktest(forward, backtest) {
  if (!backtest) return null;
  const metrics = backtest.metrics || backtest;
  let backtestProfitFactor = finiteNumber(metrics.profitFactor);
  if (metrics.profitFactor === Number.POSITIVE_INFINITY) backtestProfitFactor = Number.POSITIVE_INFINITY;
  if (backtestProfitFactor === null && Array.isArray(backtest.trades)) {
    const hasWins = backtest.trades.some((trade) => pnlValue(trade) > 0);
    const hasLosses = backtest.trades.some((trade) => pnlValue(trade) < 0);
    if (hasWins && !hasLosses) backtestProfitFactor = Number.POSITIVE_INFINITY;
  }
  const backtestValues = {
    winRate: finiteNumber(metrics.winRate),
    profitFactor: backtestProfitFactor,
    expectancy: finiteNumber(metrics.expectancy),
    averageRiskReward: backtestAverageRiskReward(backtest),
  };
  const forwardValues = {
    winRate: finiteNumber(forward?.winRate) ?? 0,
    profitFactor: forward?.profitFactor ?? 0,
    expectancy: finiteNumber(forward?.expectancy) ?? 0,
    averageRiskReward: finiteNumber(forward?.averageRiskReward),
  };
  return [
    { key: "winRate", label: "Win rate", forward: forwardValues.winRate, backtest: backtestValues.winRate, delta: metricDelta(forwardValues.winRate, backtestValues.winRate), suffix: "%" },
    { key: "profitFactor", label: "Profit factor", forward: forwardValues.profitFactor, backtest: backtestValues.profitFactor, delta: metricDelta(forwardValues.profitFactor, backtestValues.profitFactor), suffix: "" },
    { key: "expectancy", label: "Expectancy", forward: forwardValues.expectancy, backtest: backtestValues.expectancy, delta: metricDelta(forwardValues.expectancy, backtestValues.expectancy), suffix: "$" },
    { key: "averageRiskReward", label: "Average R:R", forward: forwardValues.averageRiskReward, backtest: backtestValues.averageRiskReward, delta: metricDelta(forwardValues.averageRiskReward, backtestValues.averageRiskReward), suffix: "R" },
  ];
}
