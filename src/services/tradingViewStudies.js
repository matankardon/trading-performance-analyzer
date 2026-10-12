import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";

const STUDY_BY_KEY = Object.freeze({
  smaConfirmation: { id: "MASimple@tv-basicstudies", parameter: "length", setting: "period" },
  emaConfirmation: { id: "MAExp@tv-basicstudies", parameter: "length", setting: "period" },
  rsiConfirmation: { id: "RSI@tv-basicstudies", parameter: "length", setting: "period" },
  macdConfirmation: { id: "MACD@tv-basicstudies", settings: { fastPeriod: "fastLength", slowPeriod: "slowLength", signalPeriod: "signalLength" } },
  bollingerConfirmation: { id: "BB@tv-basicstudies", settings: { period: "length", stdDevMultiplier: "stdDev" } },
  adxConfirmation: { id: "ADX@tv-basicstudies", parameter: "length", setting: "period" },
  ichimokuConfirmation: { id: "IchimokuCloud@tv-basicstudies", settings: { conversionPeriod: "conversionLineLength", basePeriod: "baseLineLength", spanBPeriod: "leadingSpanBLength" } },
  stdDevConfirmation: { id: "StdDev@tv-basicstudies", parameter: "length", setting: "period" },
});

function indicatorSettings(version) {
  const settings = version?.conditions?.indicatorSettings;
  return settings && typeof settings === "object" ? settings : {};
}

export function studiesForVersion(version) {
  const conditions = version?.conditions;
  if (!conditions || typeof conditions !== "object") return [];

  const settings = indicatorSettings(version);
  const studies = INDICATORS.filter(({ key }) => conditions[key]).map((indicator) => {
    const definition = STUDY_BY_KEY[indicator.key];
    const indicatorParams = settings[indicator.key] && typeof settings[indicator.key] === "object"
      ? settings[indicator.key]
      : {};
    if (!definition) {
      return { key: indicator.key, label: indicator.label, id: null, inputs: {}, applied: false, reason: "check manually" };
    }

    const inputs = {};
    if (definition.parameter && indicatorParams[definition.setting] !== undefined
      && indicatorParams[definition.setting] !== null
      && indicatorParams[definition.setting] !== ""
      && Number.isFinite(Number(indicatorParams[definition.setting]))) {
      inputs[definition.parameter] = Number(indicatorParams[definition.setting]);
    }
    Object.entries(definition.settings || {}).forEach(([setting, parameter]) => {
      if (indicatorParams[setting] !== undefined
        && indicatorParams[setting] !== null
        && indicatorParams[setting] !== ""
        && Number.isFinite(Number(indicatorParams[setting]))) inputs[parameter] = Number(indicatorParams[setting]);
    });
    return { key: indicator.key, label: indicator.label, id: definition.id, inputs, applied: true, reason: "" };
  });

  const manualConditions = SETUP_CONDITIONS.filter(({ key }) => conditions[key])
    .map(({ key, label }) => ({ key, label, id: null, inputs: {}, applied: false, reason: "check manually" }));
  return [...studies, ...manualConditions];
}
