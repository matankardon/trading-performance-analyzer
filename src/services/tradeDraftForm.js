import { SETUP_CONDITIONS } from "../constants/strategyOptions";

export function tradeDraftToForm(draft, strategyLibrary, emptyTrade) {
  const strategy = strategyLibrary.find((item) => item.name === draft.strategyName);
  const version = strategy?.versions.find((item) => item.version === draft.versionNumber);
  return {
    ...emptyTrade,
    metrics: {
      ...emptyTrade.metrics,
      custom: [...emptyTrade.metrics.custom],
    },
    date: draft.date || "",
    asset: draft.asset || "",
    direction: draft.direction || "",
    entry: draft.entry ?? "",
    exit: draft.exit ?? "",
    stopLoss: draft.stopLoss ?? "",
    takeProfit: draft.takeProfit ?? "",
    pnl: draft.pnl ?? "",
    session: draft.session || "",
    strategy: strategy?.name || "",
    strategyVersionId: version?.id || null,
    indicators: Array.isArray(draft.indicators) ? [...draft.indicators] : [],
    ...Object.fromEntries(SETUP_CONDITIONS.map(({ key, label }) => [
      key,
      Array.isArray(draft.conditions) && draft.conditions.includes(label),
    ])),
  };
}
