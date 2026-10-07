import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";
import { analyzeCoaching, toCoachSummaryAnalysis } from "./coachingAnalysis";
import { computeForwardStats } from "./forwardTestStats";

export const MIN_COACH_TRADES = 10;

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function safeText(value, fallback = "Not recorded") {
  if (value === null || value === undefined) return fallback;
  const withoutControls = [...String(value)].map((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  }).join("");
  const text = withoutControls
    .replace(emailPattern, "[redacted]")
    .replace(uuidPattern, "[redacted]")
    .trim()
    .slice(0, 60);
  return text || fallback;
}

function finiteOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeMetric(value) {
  return value === Number.POSITIVE_INFINITY ? "n/a" : finiteOrNull(value);
}

function toDateString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Date().toISOString().slice(0, 10);
}

function offsetDate(dateString, daysBefore) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString().slice(0, 10);
}

function tradeDate(trade) {
  const value = String(trade.date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function makeWindow(trades, label, startDate, today) {
  const windowTrades = startDate
    ? trades.filter((trade) => {
      const date = tradeDate(trade);
      return date !== null && date >= startDate && date <= today;
    })
    : trades;
  const summary = toCoachSummaryAnalysis(analyzeCoaching(windowTrades));
  return {
    label,
    startDate,
    endDate: today,
    totalTrades: windowTrades.length,
    factors: summary.factors,
    ruleBreakCost: summary.ruleBreakCost,
    combos: summary.combos,
    insights: summary.insights,
  };
}

function tradeTimestamp(trade) {
  const date = String(trade.date ?? "").trim();
  const time = String(trade.time ?? trade.trade_time ?? "").trim();
  const value = date && time ? new Date(`${date.slice(0, 10)}T${time}`) : new Date(date);
  if (Number.isFinite(value.getTime())) return value.getTime();
  const createdAt = new Date(trade.createdAt ?? trade.created_at ?? 0).getTime();
  return Number.isFinite(createdAt) ? createdAt : 0;
}

function strategyMap(strategies = []) {
  const byVersionId = new Map();
  const versions = [];
  strategies.forEach((strategy) => {
    (strategy.versions || []).forEach((version) => {
      if (!version.id) return;
      const name = safeText(strategy.name, "Unnamed strategy");
      const versionNumber = Number(version.version ?? version.versionNumber);
      const entry = {
        id: version.id,
        label: `${name} v${Number.isFinite(versionNumber) ? versionNumber : 1}`.slice(0, 60),
        strategyName: name,
        versionNumber: Number.isFinite(versionNumber) ? versionNumber : 1,
        version,
      };
      byVersionId.set(version.id, entry);
      versions.push(entry);
    });
  });
  return { byVersionId, versions };
}

function latestBacktest(version) {
  const backtest = version.latestBacktestSummary || null;
  if (!backtest) return null;
  const metrics = backtest.metrics || {};
  return {
    asset: safeText(backtest.asset),
    timeframe: safeText(backtest.timeframe),
    startDate: safeText(backtest.startDate, ""),
    endDate: safeText(backtest.endDate, ""),
    createdAt: safeText(backtest.createdAt, ""),
    metrics: {
      tradeCount: finiteOrNull(metrics.totalTrades ?? metrics.tradeCount),
      winRate: finiteOrNull(metrics.winRate),
      netPnl: finiteOrNull(metrics.netPnl),
      profitFactor: safeMetric(metrics.profitFactor),
      expectancy: finiteOrNull(metrics.expectancy),
      maxDrawdown: finiteOrNull(metrics.maxDrawdown),
      averageRiskReward: finiteOrNull(metrics.averageRiskReward),
    },
  };
}

function versionContext(entry, trades) {
  const version = entry.version;
  const versionTrades = trades.filter((trade) => (
    (trade.strategyVersionId ?? trade.strategy_version_id) === entry.id
  ));
  const stats = computeForwardStats(versionTrades);
  const enabledConditions = SETUP_CONDITIONS
    .filter(({ key }) => version.conditions?.[key] === true)
    .map(({ label }) => label);
  const enabledIndicators = INDICATORS
    .filter(({ key }) => version.conditions?.[key] === true)
    .map(({ name }) => name);

  return {
    strategy: entry.strategyName,
    version: entry.versionNumber,
    declaredConditions: enabledConditions,
    declaredIndicators: enabledIndicators,
    forwardStats: {
      tradeCount: stats.tradeCount,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      netPnl: stats.netPnl,
      expectancy: stats.expectancy,
      profitFactor: safeMetric(stats.profitFactor),
      averageRiskReward: stats.averageRiskReward,
      maxDrawdownUsd: stats.maxDrawdownUsd,
    },
    latestBacktest: latestBacktest(version),
  };
}

function tradeContext(trade, byVersionId) {
  const versionId = trade.strategyVersionId ?? trade.strategy_version_id;
  const linkedVersion = byVersionId.get(versionId);
  const conditions = {};
  SETUP_CONDITIONS.forEach(({ key, label }) => {
    conditions[label] = typeof trade[key] === "boolean" ? trade[key] : null;
  });
  const customMetrics = Array.isArray(trade.metrics?.custom)
    ? trade.metrics.custom.slice(0, 8).map((metric) => ({
      name: safeText(metric?.name),
      value: finiteOrNull(metric?.value),
    }))
    : [];

  return {
    date: tradeDate(trade),
    direction: safeText(trade.direction),
    asset: safeText(trade.asset),
    session: safeText(trade.session),
    pnl: finiteOrNull(trade.pnl),
    riskReward: finiteOrNull(trade.riskReward ?? trade.risk_reward),
    quality: safeText(trade.tradeQuality ?? trade.trade_quality),
    rule_break: typeof (trade.ruleBreak ?? trade.rule_break) === "boolean"
      ? (trade.ruleBreak ?? trade.rule_break)
      : null,
    conditions,
    indicators: Array.isArray(trade.indicators)
      ? INDICATORS.filter(({ name }) => trade.indicators.includes(name)).map(({ name }) => name)
      : [],
    metrics: {
      drawdownUsd: finiteOrNull(trade.metrics?.drawdownUsd),
      drawdownPct: finiteOrNull(trade.metrics?.drawdownPct),
      custom: customMetrics,
    },
    strategy: linkedVersion?.label || safeText(trade.strategy, "Unassigned"),
  };
}

export function buildCoachContext(trades, strategies, today = new Date().toISOString().slice(0, 10)) {
  const journalTrades = Array.isArray(trades) ? trades : [];
  const safeToday = toDateString(today);
  const { byVersionId, versions } = strategyMap(Array.isArray(strategies) ? strategies : []);
  const latestTrades = [...journalTrades]
    .sort((left, right) => tradeTimestamp(right) - tradeTimestamp(left))
    .slice(0, 50)
    .map((trade) => tradeContext(trade, byVersionId));

  return {
    totalTrades: journalTrades.length,
    today: safeToday,
    windows: {
      allTime: makeWindow(journalTrades, "All time", null, safeToday),
      last7d: makeWindow(journalTrades, "Last 7 days", offsetDate(safeToday, 6), safeToday),
      last30d: makeWindow(journalTrades, "Last 30 days", offsetDate(safeToday, 29), safeToday),
    },
    strategies: versions.map((entry) => versionContext(entry, journalTrades)),
    recentTrades: latestTrades,
  };
}