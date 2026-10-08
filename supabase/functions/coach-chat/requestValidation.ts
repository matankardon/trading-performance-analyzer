import { INDICATORS, SETUP_CONDITIONS } from "../../../src/constants/strategyOptions.js";
import { isValidDraftAllowLists } from "./draftTrade.ts";
import { isValidScreenshotTradeIds } from "./screenshotAnalysis.ts";

const factorKeys = new Set([
  "session",
  "dayOfWeek",
  ...SETUP_CONDITIONS.map(({ key }) => `setup:${key}`),
  ...INDICATORS.map(({ name }) => `indicator:${name}`),
  "tradeQuality",
  "ruleBreak",
  "strategyVersion",
]);
const conditionLabels = SETUP_CONDITIONS.map(({ label }) => label);
const indicatorNames = new Set(INDICATORS.map(({ name }) => name));
const forbiddenTextPattern = /[\u0000-\u001f\u007f]|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const privateUrlOrPathPattern = /https?:\/\/|(?<![\w])(?:[A-Za-z]:)?\/?[\w.-]+(?:[\\/][\w.-]+)+(?![\w])/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function safeString(value: unknown, maxLength = 60): value is string {
  return typeof value === "string" && value.length <= maxLength
    && !forbiddenTextPattern.test(value)
    && (!privateUrlOrPathPattern.test(value) || /^[A-Z]{3}\/[A-Z]{3}$/.test(value));
}

function finiteOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isDate(value: unknown, allowNull = false): boolean {
  return (allowNull && value === null) || (typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function validGroupKey(factorKey: string, value: unknown): boolean {
  if (!safeString(value)) return false;
  if (factorKey === "session") return ["New York", "London", "Asia", "Overlap", "Not recorded"].includes(value) || /^Other session [A-Z]+$/.test(value);
  if (factorKey === "dayOfWeek") return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Not recorded"].includes(value);
  if (factorKey.startsWith("setup:")) return ["Present", "Absent", "Not recorded"].includes(value);
  if (factorKey.startsWith("indicator:")) return ["Used", "Not used", "Not recorded"].includes(value);
  if (factorKey === "tradeQuality") return ["A+", "Valid", "Emotional", "Other", "Not recorded"].includes(value);
  if (factorKey === "ruleBreak") return ["Yes", "No", "Not recorded"].includes(value);
  return factorKey === "strategyVersion" && (value === "Unassigned" || /^Version [A-Z]+$/.test(value));
}

function validGroup(value: unknown, totalTrades: number, factorKey: string): boolean {
  if (!exactKeys(value, ["key", "n", "winRate", "netPnl", "expectancy", "profitFactor", "averageRiskReward", "lowSample"])) return false;
  return validGroupKey(factorKey, value.key)
    && Number.isInteger(value.n) && (value.n as number) >= 0 && (value.n as number) <= totalTrades
    && typeof value.winRate === "number" && Number.isFinite(value.winRate) && value.winRate >= 0 && value.winRate <= 100
    && typeof value.netPnl === "number" && Number.isFinite(value.netPnl)
    && typeof value.expectancy === "number" && Number.isFinite(value.expectancy)
    && (value.profitFactor === "n/a" || (typeof value.profitFactor === "number" && Number.isFinite(value.profitFactor) && value.profitFactor >= 0))
    && (value.averageRiskReward === null || (typeof value.averageRiskReward === "number" && Number.isFinite(value.averageRiskReward)))
    && typeof value.lowSample === "boolean" && value.lowSample === ((value.n as number) < 5);
}

function validFactor(value: unknown, totalTrades: number): boolean {
  if (!exactKeys(value, ["key", "label", "groups"]) || typeof value.key !== "string" || !factorKeys.has(value.key)) return false;
  if (!safeString(value.label) || !Array.isArray(value.groups) || value.groups.length > totalTrades + 1) return false;
  const seen = new Set<string>();
  return value.groups.every((group) => {
    if (!validGroup(group, totalTrades, value.key) || seen.has(group.key)) return false;
    seen.add(group.key);
    return true;
  });
}

function validCombo(value: unknown, totalTrades: number): boolean {
  if (!exactKeys(value, ["conditions", "n", "winRate", "netPnl", "expectancy", "profitFactor", "averageRiskReward"])) return false;
  return Array.isArray(value.conditions) && value.conditions.length >= 2 && value.conditions.length <= 3
    && value.conditions.every((condition) => safeString(condition) && [...conditionLabels, ...indicatorNames].includes(condition))
    && Number.isInteger(value.n) && (value.n as number) >= 5 && (value.n as number) <= totalTrades
    && typeof value.winRate === "number" && Number.isFinite(value.winRate) && value.winRate >= 0 && value.winRate <= 100
    && typeof value.netPnl === "number" && Number.isFinite(value.netPnl)
    && typeof value.expectancy === "number" && Number.isFinite(value.expectancy)
    && (value.profitFactor === "n/a" || (typeof value.profitFactor === "number" && Number.isFinite(value.profitFactor) && value.profitFactor >= 0))
    && finiteOrNull(value.averageRiskReward);
}

function validWindow(value: unknown, expectedLabel: string, today: string): boolean {
  if (!exactKeys(value, ["label", "startDate", "endDate", "totalTrades", "factors", "ruleBreakCost", "combos", "insights"])) return false;
  if (value.label !== expectedLabel || !isDate(value.startDate, true) || value.endDate !== today
    || !Number.isInteger(value.totalTrades) || (value.totalTrades as number) < 0 || (value.totalTrades as number) > 100_000) return false;
  const total = value.totalTrades as number;
  if (!Array.isArray(value.factors) || value.factors.length !== factorKeys.size || !value.factors.every((factor) => validFactor(factor, total))) return false;
  if (!exactKeys(value.ruleBreakCost, ["ruleBreak", "clean", "averagePnlDifference", "totalPnlDifference"])) return false;
  for (const group of [value.ruleBreakCost.ruleBreak, value.ruleBreakCost.clean]) {
    if (!exactKeys(group, ["n", "averagePnl", "totalPnl", "lowSample"]) || !Number.isInteger(group.n)
      || (group.n as number) < 0 || (group.n as number) > total || !finiteOrNull(group.averagePnl)
      || typeof group.totalPnl !== "number" || !Number.isFinite(group.totalPnl)
      || group.lowSample !== ((group.n as number) < 5)) return false;
  }
  if (!finiteOrNull(value.ruleBreakCost.averagePnlDifference) || !finiteOrNull(value.ruleBreakCost.totalPnlDifference)) return false;
  if (!exactKeys(value.combos, ["best", "worst"]) || !Array.isArray(value.combos.best) || !Array.isArray(value.combos.worst)
    || value.combos.best.length > 3 || value.combos.worst.length > 3
    || ![...value.combos.best, ...value.combos.worst].every((combo) => validCombo(combo, total))) return false;
  if (!Array.isArray(value.insights) || value.insights.length > 5) return false;
  return value.insights.every((insight) => exactKeys(insight, ["factor", "effectSize", "evidence"])
    && safeString(insight.factor) && typeof insight.effectSize === "number" && Number.isFinite(insight.effectSize)
    && Array.isArray(insight.evidence) && insight.evidence.length >= 2 && insight.evidence.length <= 3
    && insight.evidence.every((item) => exactKeys(item, ["key", "n", "expectancy"])
      && safeString(item.key) && Number.isInteger(item.n) && (item.n as number) >= 5 && (item.n as number) <= total
      && typeof item.expectancy === "number" && Number.isFinite(item.expectancy)));
}

function validStrategy(value: unknown, totalTrades: number): boolean {
  if (!exactKeys(value, ["strategy", "version", "declaredConditions", "declaredIndicators", "conditionEvidence", "forwardStats", "latestBacktest", "forwardVsBacktest"])) return false;
  if (!safeString(value.strategy) || !Number.isInteger(value.version) || (value.version as number) < 1) return false;
  if (!Array.isArray(value.declaredConditions) || !value.declaredConditions.every((item) => conditionLabels.includes(item))) return false;
  if (!Array.isArray(value.declaredIndicators) || !value.declaredIndicators.every((item) => indicatorNames.has(item))) return false;
  if (!Array.isArray(value.conditionEvidence) || value.conditionEvidence.length > conditionLabels.length + indicatorNames.size) return false;
  if (!value.conditionEvidence.every((item) => {
    if (!exactKeys(item, ["name", "kind", "present", "absent"])
      || !safeString(item.name)
      || !["setup", "indicator"].includes(item.kind)
      || (item.kind === "setup" ? !conditionLabels.includes(item.name) : !indicatorNames.has(item.name))) return false;
    return [item.present, item.absent].every((group) => exactKeys(group, ["n", "expectancy"])
      && Number.isInteger(group.n) && (group.n as number) >= 0 && (group.n as number) <= totalTrades
      && finiteOrNull(group.expectancy) && (group.n === 0 ? group.expectancy === null : typeof group.expectancy === "number"));
  })) return false;
  const stats = value.forwardStats;
  if (!exactKeys(stats, ["tradeCount", "wins", "losses", "winRate", "netPnl", "expectancy", "profitFactor", "averageRiskReward", "maxDrawdownUsd"])) return false;
  if (![stats.tradeCount, stats.wins, stats.losses].every((count) => Number.isInteger(count) && count >= 0 && count <= totalTrades)) return false;
  if (![stats.winRate, stats.netPnl, stats.expectancy, stats.maxDrawdownUsd].every((number) => typeof number === "number" && Number.isFinite(number))) return false;
  if (!(stats.profitFactor === "n/a" || (typeof stats.profitFactor === "number" && Number.isFinite(stats.profitFactor)))) return false;
  if (!finiteOrNull(stats.averageRiskReward)) return false;
  if (value.latestBacktest === null) return value.forwardVsBacktest === null;
  const backtest = value.latestBacktest;
  if (!exactKeys(backtest, ["asset", "timeframe", "startDate", "endDate", "createdAt", "metrics"])) return false;
  if (![backtest.asset, backtest.timeframe, backtest.startDate, backtest.endDate, backtest.createdAt].every((text) => safeString(text))) return false;
  const metrics = backtest.metrics;
  if (!exactKeys(metrics, ["tradeCount", "winRate", "netPnl", "profitFactor", "expectancy", "maxDrawdown", "averageRiskReward"])) return false;
  const validMetrics = finiteOrNull(metrics.tradeCount) && finiteOrNull(metrics.winRate) && finiteOrNull(metrics.netPnl)
    && (metrics.profitFactor === "n/a" || finiteOrNull(metrics.profitFactor))
    && finiteOrNull(metrics.expectancy) && finiteOrNull(metrics.maxDrawdown) && finiteOrNull(metrics.averageRiskReward);
  if (!validMetrics || !exactKeys(value.forwardVsBacktest, ["winRate", "netPnl", "profitFactor", "expectancy", "maxDrawdown", "averageRiskReward"])) return false;
  return Object.values(value.forwardVsBacktest).every(finiteOrNull);
}

function validRecentTrade(value): boolean {
  if (!exactKeys(value, ["date", "direction", "asset", "session", "pnl", "riskReward", "quality", "rule_break", "conditions", "indicators", "metrics", "strategy"])) return false;
  if (!isDate(value.date, true) || ![value.direction, value.asset, value.session, value.quality, value.strategy].every((text) => safeString(text))) return false;
  if (!finiteOrNull(value.pnl) || !finiteOrNull(value.riskReward) || !(value.rule_break === null || typeof value.rule_break === "boolean")) return false;
  if (!exactKeys(value.conditions, conditionLabels)) return false;
  if (!conditionLabels.every((label) => value.conditions[label] === null || typeof value.conditions[label] === "boolean")) return false;
  if (!Array.isArray(value.indicators) || !value.indicators.every((name) => indicatorNames.has(name))) return false;
  if (!exactKeys(value.metrics, ["drawdownUsd", "drawdownPct", "custom"]) || !finiteOrNull(value.metrics.drawdownUsd) || !finiteOrNull(value.metrics.drawdownPct)) return false;
  return Array.isArray(value.metrics.custom) && value.metrics.custom.length <= 8
    && value.metrics.custom.every((metric) => exactKeys(metric, ["name", "value"]) && safeString(metric.name) && finiteOrNull(metric.value));
}

export function isValidCoachContext(value: unknown): boolean {
  if (!exactKeys(value, ["totalTrades", "today", "windows", "strategies", "recentTrades"])) return false;
  if (!Number.isInteger(value.totalTrades) || (value.totalTrades as number) < 0 || (value.totalTrades as number) > 100_000 || !isDate(value.today)) return false;
  if (!exactKeys(value.windows, ["allTime", "last7d", "last30d"])) return false;
  if (!validWindow(value.windows.allTime, "All time", value.today)
    || !validWindow(value.windows.last7d, "Last 7 days", value.today)
    || !validWindow(value.windows.last30d, "Last 30 days", value.today)) return false;
  if (!Array.isArray(value.strategies) || value.strategies.length > 100 || !value.strategies.every((strategy) => validStrategy(strategy, value.totalTrades))) return false;
  return Array.isArray(value.recentTrades) && value.recentTrades.length <= 50 && value.recentTrades.every(validRecentTrade);
}

function validMessageAndHistory(value: Record<string, unknown>): boolean {
  return typeof value.message === "string" && value.message.trim().length > 0 && value.message.length <= 2000
    && Array.isArray(value.history) && value.history.length <= 20
    && value.history.every((entry) => exactKeys(entry, ["role", "content"])
      && ["user", "assistant"].includes(entry.role)
      && typeof entry.content === "string" && entry.content.length <= 2000);
}

export function isValidCoachChatRequest(value: unknown): value is {
  mode?: string;
  message: string;
  history: Array<{ role: string; content: string }>;
  context?: Record<string, unknown>;
  tradeIds?: string[];
  stream?: boolean;
  allowLists?: unknown;
} {
  if (!isRecord(value)) return false;
  if (!Object.hasOwn(value, "mode")) {
    return exactKeys(value, ["message", "history", "context"])
      && validMessageAndHistory(value)
      && isValidCoachContext(value.context);
  }
  if (value.mode === "draft_trade") {
    return exactKeys(value, ["mode", "message", "history", "allowLists"])
      && validMessageAndHistory(value)
      && isValidDraftAllowLists(value.allowLists);
  }
  if (value.mode === "analyze_screenshot") {
    const requiredKeys = ["mode", "message", "history", "context", "tradeIds"];
    const hasStream = Object.hasOwn(value, "stream");
    return exactKeys(value, hasStream ? [...requiredKeys, "stream"] : requiredKeys)
      && (!hasStream || typeof value.stream === "boolean")
      && validMessageAndHistory(value)
      && isValidCoachContext(value.context)
      && isValidScreenshotTradeIds(value.tradeIds);
  }
  const hasMode = Object.hasOwn(value, "mode");
  return exactKeys(value, ["mode", "message", "history", "context"])
    && hasMode && ["stream", "complete", "title"].includes(value.mode as string)
    && validMessageAndHistory(value)
    && isValidCoachContext(value.context);
}