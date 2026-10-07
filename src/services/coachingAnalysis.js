import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";
import { computeTradeStats } from "./forwardTestStats";

export const MIN_SAMPLE = 5;
const MIN_COMBO_SAMPLE = 5;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function indicatorUsed(trade, name) {
  return Array.isArray(trade?.indicators) && trade.indicators.includes(name);
}

function fieldValue(trade, camelName, databaseName) {
  return trade?.[camelName] ?? trade?.[databaseName];
}

function normalizeQuality(value) {
  const quality = String(value ?? "").trim().toLowerCase();
  if (quality === "a+" || quality.includes("a+")) return "A+";
  if (quality.includes("emotional")) return "Emotional";
  if (quality.includes("valid")) return "Valid";
  return value ? "Other" : "Not recorded";
}

function dayOfWeek(trade) {
  const dateValue = String(trade?.date ?? "").trim();
  if (!dateValue) return "Not recorded";
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Not recorded" : DAYS[date.getUTCDay()];
}

function summarizeGroup(key, trades) {
  const stats = computeTradeStats(trades);
  return {
    key,
    n: stats.tradeCount,
    winRate: stats.winRate,
    netPnl: stats.netPnl,
    expectancy: stats.expectancy,
    profitFactor: stats.losses === 0 ? "n/a" : stats.profitFactor,
    averageRiskReward: stats.averageRiskReward,
    lowSample: stats.tradeCount < MIN_SAMPLE,
  };
}

export function groupStats(trades, keyFn) {
  const groups = new Map();
  (Array.isArray(trades) ? trades : []).forEach((trade) => {
    const rawKey = keyFn(trade);
    const key = String(rawKey ?? "Not recorded");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  });

  return [...groups.entries()].map(([key, groupTrades]) => summarizeGroup(key, groupTrades));
}

function buildFactors(trades) {
  const factors = [
    {
      key: "session",
      label: "Session",
      type: "category",
      groups: groupStats(trades, (trade) => String(trade?.session ?? "").trim() || "Not recorded"),
    },
    {
      key: "dayOfWeek",
      label: "Day of week",
      type: "category",
      groups: groupStats(trades, dayOfWeek),
    },
  ];

  SETUP_CONDITIONS.forEach(({ key, label }) => {
    factors.push({
      key: `setup:${key}`,
      label,
      type: "binary",
      dimension: "setup",
      groups: groupStats(trades, (trade) => (
        typeof trade?.[key] === "boolean" ? (trade[key] ? "Present" : "Absent") : "Not recorded"
      )),
    });
  });

  INDICATORS.forEach(({ name, label }) => {
    factors.push({
      key: `indicator:${name}`,
      label,
      type: "binary",
      dimension: "indicator",
      groups: groupStats(trades, (trade) => (
        Array.isArray(trade?.indicators) ? (indicatorUsed(trade, name) ? "Used" : "Not used") : "Not recorded"
      )),
    });
  });

  factors.push(
    {
      key: "tradeQuality",
      label: "Trade quality",
      type: "category",
      groups: groupStats(trades, (trade) => normalizeQuality(trade?.tradeQuality ?? trade?.trade_quality)),
    },
    {
      key: "ruleBreak",
      label: "Rule break",
      type: "binary",
      dimension: "ruleBreak",
      groups: groupStats(trades, (trade) => {
        const value = fieldValue(trade, "ruleBreak", "rule_break");
        return typeof value === "boolean" ? (value ? "Yes" : "No") : "Not recorded";
      }),
    },
    {
      key: "strategyVersion",
      label: "Strategy version",
      type: "category",
      groups: groupStats(trades, (trade) => (
        String(fieldValue(trade, "strategyVersionId", "strategy_version_id") ?? "").trim() || "Unassigned"
      )),
    },
  );

  return factors;
}

function combinations(values, minimumSize = 2, maximumSize = 3) {
  const result = [];
  function addFrom(start, selected) {
    if (selected.length >= minimumSize) result.push([...selected]);
    if (selected.length === maximumSize) return;
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]);
      addFrom(index + 1, selected);
      selected.pop();
    }
  }
  addFrom(0, []);
  return result;
}

const comboConditions = [
  ...SETUP_CONDITIONS.map(({ key, label }) => ({ key, label,   active: (trade) => trade?.[key] === true })),
  ...INDICATORS.map(({ name, label }) => ({
    key: `indicator:${name}`,
    label,
    active: (trade) => indicatorUsed(trade, name),
  })),
];

export function rankCombos(trades) {
  const buckets = new Map();
  (Array.isArray(trades) ? trades : []).forEach((trade) => {
    const active = comboConditions.filter(({ active: isActive }) => isActive(trade));
    combinations(active).forEach((conditions) => {
      const key = conditions.map(({ key }) => key).join("|");
      if (!buckets.has(key)) buckets.set(key, { conditions, trades: [] });
      buckets.get(key).trades.push(trade);
    });
  });

  const ranked = [...buckets.values()]
    .map(({ conditions, trades: groupedTrades }) => ({
      ...summarizeGroup(conditions.map(({ label }) => label).join(" + "), groupedTrades),
      conditions: conditions.map(({ label }) => label),
    }))
    .filter((combo) => combo.n >= MIN_COMBO_SAMPLE)
    .sort((left, right) => right.expectancy - left.expectancy || left.key.localeCompare(right.key));

  return {
    best: ranked.slice(0, 3),
    worst: [...ranked].reverse().slice(0, 3),
  };
}

function ruleBreakGroup(trades) {
  const stats = computeTradeStats(trades);
  return {
    n: stats.tradeCount,
    averagePnl: stats.tradeCount ? stats.expectancy : null,
    totalPnl: stats.netPnl,
    lowSample: stats.tradeCount < MIN_SAMPLE,
  };
}

export function ruleBreakCost(trades) {
  const safeTrades = Array.isArray(trades) ? trades : [];
  const broken = safeTrades.filter((trade) => fieldValue(trade, "ruleBreak", "rule_break") === true);
  const clean = safeTrades.filter((trade) => fieldValue(trade, "ruleBreak", "rule_break") === false);
  const ruleBreak = ruleBreakGroup(broken);
  const cleanTrades = ruleBreakGroup(clean);
  return {
    ruleBreak,
    clean: cleanTrades,
    averagePnlDifference: ruleBreak.n && cleanTrades.n
      ? ruleBreak.averagePnl - cleanTrades.averagePnl
      : null,
    totalPnlDifference: ruleBreak.n && cleanTrades.n
      ? ruleBreak.totalPnl - cleanTrades.totalPnl
      : null,
  };
}

function makeInsight(text, effectSize, groups) {
  return {
    text,
    effectSize: Number.isFinite(effectSize) ? Math.abs(effectSize) : 0,
    evidence: groups.map(({ key, n, expectancy }) => ({ key, n, expectancy })),
  };
}

export function generateInsights(analysis) {
  const insights = [];
  (analysis?.factors ?? []).forEach((factor) => {
    const eligible = factor.groups.filter(({ n }) => n >= MIN_SAMPLE);
    if (eligible.length < 2) return;
    const sorted = [...eligible].sort((left, right) => left.expectancy - right.expectancy);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    if (low.key === high.key) return;
    const difference = high.expectancy - low.expectancy;
    let text;
    if (factor.dimension === "setup") {
      const present = eligible.find(({ key }) => key === "Present");
      const absent = eligible.find(({ key }) => key === "Absent");
      if (!present || !absent) return;
      text = `Trades with ${factor.label} averaged ${formatMoney(present.expectancy)} per trade vs ${formatMoney(absent.expectancy)} without (n=${present.n} vs ${absent.n}).`;
      insights.push(makeInsight(text, present.expectancy - absent.expectancy, [present, absent]));
      return;
    } else if (factor.dimension === "indicator") {
      const used = eligible.find(({ key }) => key === "Used");
      const notUsed = eligible.find(({ key }) => key === "Not used");
      if (!used || !notUsed) return;
      text = `Trades using ${factor.label} averaged ${formatMoney(used.expectancy)} per trade vs ${formatMoney(notUsed.expectancy)} without it (n=${used.n} vs ${notUsed.n}).`;
      insights.push(makeInsight(text, used.expectancy - notUsed.expectancy, [used, notUsed]));
      return;
    } else if (factor.dimension === "ruleBreak") {
      const broken = eligible.find(({ key }) => key === "Yes");
      const clean = eligible.find(({ key }) => key === "No");
      if (!broken || !clean) return;
      text = `Clean trades averaged ${formatMoney(clean.expectancy)} per trade vs ${formatMoney(broken.expectancy)} with rule breaks (n=${clean.n} vs ${broken.n}).`;
      insights.push(makeInsight(text, clean.expectancy - broken.expectancy, [clean, broken]));
      return;
    } else {
      text = `${factor.label}: ${high.key} trades averaged ${formatMoney(high.expectancy)} per trade vs ${formatMoney(low.expectancy)} for ${low.key} (n=${high.n} vs ${low.n}).`;
    }
    insights.push(makeInsight(text, difference, [high, low]));
  });

  return insights
    .sort((left, right) => right.effectSize - left.effectSize || left.text.localeCompare(right.text))
    .slice(0, 5);
}

function formatMoney(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
}

export function analyzeCoaching(trades) {
  const safeTrades = Array.isArray(trades) ? trades : [];
  const analysis = {
    totalTrades: safeTrades.length,
    factors: buildFactors(safeTrades),
    combos: rankCombos(safeTrades),
    ruleBreakCost: ruleBreakCost(safeTrades),
    sampleNotice: safeTrades.length < 30
      ? `Use these patterns as a small-sample snapshot: ${safeTrades.length} trades logged; 30 or more are recommended for broader comparisons.`
      : null,
  };
  analysis.insights = generateInsights(analysis);
  return analysis;
}
