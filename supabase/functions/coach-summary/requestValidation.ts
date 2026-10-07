import { INDICATORS, SETUP_CONDITIONS } from "../../../src/constants/strategyOptions.js";

type FactorDefinition = { key: string; label: string };

const factorDefinitions: FactorDefinition[] = [
  { key: "session", label: "Session" },
  { key: "dayOfWeek", label: "Day of week" },
  ...SETUP_CONDITIONS.map(({ key, label }) => ({ key: `setup:${key}`, label })),
  ...INDICATORS.map(({ name, label }) => ({ key: `indicator:${name}`, label })),
  { key: "tradeQuality", label: "Trade quality" },
  { key: "ruleBreak", label: "Rule break" },
  { key: "strategyVersion", label: "Strategy version" },
];

const knownConditions = new Set([
  ...SETUP_CONDITIONS.map(({ label }) => label),
  ...INDICATORS.map(({ label }) => label),
]);
const days = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Not recorded"]);
const sessions = new Set(["New York", "London", "Asia", "Overlap", "Not recorded"]);
const qualities = new Set(["A+", "Valid", "Emotional", "Other", "Not recorded"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDate(value: unknown): boolean {
  return value === null || (
    typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function isAlias(value: string, prefix: string): boolean {
  return new RegExp(`^${prefix} [A-Z]+$`).test(value);
}

function isGroupKey(factorKey: string, value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  if (factorKey === "session") return sessions.has(value) || isAlias(value, "Other session");
  if (factorKey === "dayOfWeek") return days.has(value);
  if (factorKey.startsWith("setup:")) return ["Present", "Absent", "Not recorded"].includes(value);
  if (factorKey.startsWith("indicator:")) return ["Used", "Not used", "Not recorded"].includes(value);
  if (factorKey === "tradeQuality") return qualities.has(value);
  if (factorKey === "ruleBreak") return ["Yes", "No", "Not recorded"].includes(value);
  if (factorKey === "strategyVersion") return value === "Unassigned" || isAlias(value, "Version");
  return false;
}

function isGroupStats(value: unknown, totalTrades: number): boolean {
  if (!hasExactKeys(value, ["key", "n", "winRate", "netPnl", "expectancy", "profitFactor", "averageRiskReward", "lowSample"])) return false;
  return typeof value.key === "string"
    && Number.isInteger(value.n)
    && (value.n as number) >= 0
    && (value.n as number) <= totalTrades
    && isFiniteNumber(value.winRate)
    && value.winRate >= 0
    && value.winRate <= 100
    && isFiniteNumber(value.netPnl)
    && isFiniteNumber(value.expectancy)
    && (value.profitFactor === "n/a" || (isFiniteNumber(value.profitFactor) && value.profitFactor >= 0))
    && (value.averageRiskReward === null || (isFiniteNumber(value.averageRiskReward) && value.averageRiskReward >= 0))
    && typeof value.lowSample === "boolean"
    && value.lowSample === ((value.n as number) < 5);
}

function isCostGroup(value: unknown, totalTrades: number): boolean {
  if (!hasExactKeys(value, ["n", "averagePnl", "totalPnl", "lowSample"])) return false;
  return Number.isInteger(value.n)
    && (value.n as number) >= 0
    && (value.n as number) <= totalTrades
    && (value.averagePnl === null || isFiniteNumber(value.averagePnl))
    && isFiniteNumber(value.totalPnl)
    && typeof value.lowSample === "boolean"
    && value.lowSample === ((value.n as number) < 5);
}

function factorKeyForLabel(label: string): string | null {
  return factorDefinitions.find((factor) => factor.label === label)?.key ?? null;
}

function isCombo(value: unknown, totalTrades: number): boolean {
  if (!hasExactKeys(value, ["conditions", "n", "winRate", "netPnl", "expectancy", "profitFactor", "averageRiskReward"])) return false;
  return Array.isArray(value.conditions)
    && value.conditions.length >= 2
    && value.conditions.length <= 3
    && value.conditions.every((condition) => typeof condition === "string" && knownConditions.has(condition))
    && Number.isInteger(value.n)
    && (value.n as number) >= 5
    && (value.n as number) <= totalTrades
    && isFiniteNumber(value.winRate)
    && value.winRate >= 0
    && value.winRate <= 100
    && isFiniteNumber(value.netPnl)
    && isFiniteNumber(value.expectancy)
    && (value.profitFactor === "n/a" || (isFiniteNumber(value.profitFactor) && value.profitFactor >= 0))
    && (value.averageRiskReward === null || (isFiniteNumber(value.averageRiskReward) && value.averageRiskReward >= 0));
}

function isInsight(value: unknown, totalTrades: number): boolean {
  if (!hasExactKeys(value, ["factor", "effectSize", "evidence"])) return false;
  if (typeof value.factor !== "string" || !isFiniteNumber(value.effectSize) || value.effectSize < 0) return false;
  const factorKey = factorKeyForLabel(value.factor);
  if (!factorKey) return false;
  return Array.isArray(value.evidence)
    && value.evidence.length >= 2
    && value.evidence.length <= 3
    && value.evidence.every((item) => hasExactKeys(item, ["key", "n", "expectancy"])
      && isGroupKey(factorKey, item.key)
      && Number.isInteger(item.n)
      && (item.n as number) >= 5
      && (item.n as number) <= totalTrades
      && isFiniteNumber(item.expectancy));
}

export function isValidCoachAnalysis(value: unknown): value is Record<string, unknown> {
  if (!hasExactKeys(value, ["totalTrades", "filterRange", "factors", "ruleBreakCost", "combos", "insights"])) return false;
  if (!Number.isInteger(value.totalTrades) || (value.totalTrades as number) < 0 || (value.totalTrades as number) > 100_000) return false;
  const totalTrades = value.totalTrades as number;

  if (!hasExactKeys(value.filterRange, ["from", "to", "strategyVersionFiltered"])) return false;
  if (!isDate(value.filterRange.from) || !isDate(value.filterRange.to) || typeof value.filterRange.strategyVersionFiltered !== "boolean") return false;

  if (!Array.isArray(value.factors) || value.factors.length !== factorDefinitions.length) return false;
  const seenFactors = new Set<string>();
  for (const factor of value.factors) {
    if (!hasExactKeys(factor, ["key", "label", "groups"]) || typeof factor.key !== "string" || typeof factor.label !== "string") return false;
    const definition = factorDefinitions.find(({ key }) => key === factor.key);
    if (!definition || factor.label !== definition.label || seenFactors.has(factor.key)) return false;
    seenFactors.add(factor.key);
    if (!Array.isArray(factor.groups) || factor.groups.length > totalTrades + 1) return false;
    const seenGroups = new Set<string>();
    for (const group of factor.groups) {
      if (!isGroupStats(group, totalTrades) || !isGroupKey(factor.key, group.key) || seenGroups.has(group.key)) return false;
      seenGroups.add(group.key);
    }
  }

  if (!hasExactKeys(value.ruleBreakCost, ["ruleBreak", "clean", "averagePnlDifference", "totalPnlDifference"])) return false;
  if (!isCostGroup(value.ruleBreakCost.ruleBreak, totalTrades) || !isCostGroup(value.ruleBreakCost.clean, totalTrades)) return false;
  if (!((value.ruleBreakCost.averagePnlDifference === null) || isFiniteNumber(value.ruleBreakCost.averagePnlDifference))) return false;
  if (!((value.ruleBreakCost.totalPnlDifference === null) || isFiniteNumber(value.ruleBreakCost.totalPnlDifference))) return false;

  if (!hasExactKeys(value.combos, ["best", "worst"])) return false;
  if (!Array.isArray(value.combos.best) || !Array.isArray(value.combos.worst)
    || value.combos.best.length > 3 || value.combos.worst.length > 3
    || ![...value.combos.best, ...value.combos.worst].every((combo) => isCombo(combo, totalTrades))) return false;

  if (!Array.isArray(value.insights) || value.insights.length > 5
    || !value.insights.every((insight) => isInsight(insight, totalTrades))) return false;

  return true;
}