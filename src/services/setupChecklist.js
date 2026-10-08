import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";

export const SETUP_SCORE_BANDS = Object.freeze({
  ready: 80,
  partial: 40,
});

function declaredItems(version) {
  const conditions = version?.conditions ?? {};
  return [
    ...SETUP_CONDITIONS.filter(({ key }) => Boolean(conditions[key])).map(({ key, label }) => ({ key, label })),
    ...INDICATORS.filter(({ key }) => Boolean(conditions[key])).map(({ key, name, label }) => ({ key, name, label })),
  ];
}

function isTicked(ticked, key) {
  if (ticked instanceof Set) return ticked.has(key);
  if (Array.isArray(ticked)) return ticked.includes(key);
  return Boolean(ticked?.[key]);
}

function requiredKeys(version) {
  const configured = version?.requiredConditions ?? version?.conditions?.requiredConditions;
  if (!Array.isArray(configured)) return [];
  return configured.map((item) => typeof item === "string" ? item : item?.key).filter(Boolean);
}

export function computeSetupScore(version, ticked = [], weights = {}) {
  const items = declaredItems(version);
  if (!items.length) return { score: 0, met: 0, total: 0, weightMet: 0, weightTotal: 0 };

  let weightMet = 0;
  let weightTotal = 0;
  let met = 0;
  items.forEach(({ key }) => {
    const rawWeight = Number(weights?.[key] ?? version?.conditions?.weights?.[key] ?? 1);
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1;
    weightTotal += weight;
    if (isTicked(ticked, key)) {
      weightMet += weight;
      met += 1;
    }
  });

  const score = weightTotal ? Math.round((weightMet / weightTotal) * 100) : 0;
  return { score: Number.isFinite(score) ? score : 0, met, total: items.length, weightMet, weightTotal };
}

export function bandFromScore(score, hasMissingRequired = false) {
  const numericScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  if (hasMissingRequired || numericScore < SETUP_SCORE_BANDS.partial) return "Not ready";
  return numericScore >= SETUP_SCORE_BANDS.ready ? "Ready" : "Partial";
}

export function missingRequired(version, ticked = []) {
  const required = new Set(requiredKeys(version));
  return declaredItems(version)
    .filter(({ key }) => required.has(key) && !isTicked(ticked, key))
    .map(({ key, label }) => ({ key, label }));
}

function tradeVersionId(trade) {
  return trade?.strategyVersionId ?? trade?.strategy_version_id;
}

function hasTradeCondition(trade, condition) {
  if (INDICATORS.some(({ key, name }) => key === condition || name === condition)) {
    const indicator = INDICATORS.find(({ key, name }) => key === condition || name === condition);
    return Array.isArray(trade?.indicators) && trade.indicators.includes(indicator.name);
  }
  return trade?.[condition] === true;
}

export function matchingTrades(trades, versionId, tickedConditions = []) {
  if (!versionId) return [];
  const selected = tickedConditions instanceof Set
    ? [...tickedConditions]
    : Array.isArray(tickedConditions)
      ? tickedConditions
      : Object.keys(tickedConditions || {}).filter((key) => tickedConditions[key]);

  return (Array.isArray(trades) ? trades : []).filter((trade) => (
    tradeVersionId(trade) === versionId
    && selected.every((condition) => hasTradeCondition(trade, condition))
  ));
}
