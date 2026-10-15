import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";

export const TRADINGVIEW_STUDY_IDS = Object.freeze({
  smaConfirmation: Object.freeze({ id: "STD;SMA", verified: true }),
  emaConfirmation: Object.freeze({ id: "STD;EMA", verified: true }),
  rsiConfirmation: Object.freeze({ id: "STD;RSI", verified: true }),
  macdConfirmation: Object.freeze({ id: "STD;MACD", verified: true }),
  bollingerConfirmation: Object.freeze({ id: "STD;Bollinger_Bands", verified: true }),
  adxConfirmation: Object.freeze({ id: "STD;ADX", verified: true }),
  ichimokuConfirmation: Object.freeze({ id: "STD;Ichimoku%Cloud", verified: false }),
  stdDevConfirmation: Object.freeze({ id: "STD;Standard_Deviation", verified: false }),
});

const INDICATOR_PARAMETER_LABELS = Object.freeze({
  smaConfirmation: { period: "length" },
  emaConfirmation: { period: "length" },
  rsiConfirmation: { period: "length" },
  macdConfirmation: { fastPeriod: "fast length", slowPeriod: "slow length", signalPeriod: "signal length" },
  bollingerConfirmation: { period: "length", stdDevMultiplier: "standard deviation" },
  adxConfirmation: { period: "length" },
  ichimokuConfirmation: { conversionPeriod: "conversion length", basePeriod: "base length", spanBPeriod: "span B length" },
  stdDevConfirmation: { period: "length" },
});

function indicatorSettings(version) {
  const settings = version?.conditions?.indicatorSettings;
  return settings && typeof settings === "object" ? settings : {};
}

function readParameters(version, key) {
  const settings = indicatorSettings(version);
  const values = settings[key] && typeof settings[key] === "object" ? settings[key] : {};
  return Object.fromEntries(Object.entries(INDICATOR_PARAMETER_LABELS[key] || {})
    .filter(([setting]) => values[setting] !== undefined
      && values[setting] !== null
      && values[setting] !== ""
      && Number.isFinite(Number(values[setting])))
    .map(([setting, label]) => [label, Number(values[setting])]));
}

export function dedupeVerifiedStudyIds(indicators) {
  return [...new Set(indicators
    .filter(({ status, id }) => status === "sent" && typeof id === "string" && id.trim())
    .map(({ id }) => id))];
}

export function studiesForVersion(version, customScriptId = "") {
  const conditions = version?.conditions;
  if (!conditions || typeof conditions !== "object") {
    const customStudy = typeof customScriptId === "string" && customScriptId.trim()
      ? `PUB;${customScriptId.trim()}`
      : "";
    return {
      indicators: [],
      studies: customStudy ? [customStudy] : [],
      manualConditions: [],
      manualOnly: false,
      ...(customStudy ? { customScript: { id: customScriptId.trim(), status: "unverified" } } : {}),
    };
  }

  const indicators = INDICATORS.filter(({ key }) => conditions[key]).map((indicator) => {
    const definition = TRADINGVIEW_STUDY_IDS[indicator.key];
    const parameters = readParameters(version, indicator.key);
    if (!definition) {
      return { ...indicator, id: null, verified: false, status: "manual", parameters };
    }
    return {
      ...indicator,
      id: definition.id,
      verified: definition.verified,
      status: definition.verified ? "sent" : "unverified",
      parameters,
    };
  });
  const verifiedStudies = dedupeVerifiedStudyIds(indicators);
  const studies = [...verifiedStudies];
  const normalizedCustomId = typeof customScriptId === "string" ? customScriptId.trim() : "";
  const customStudy = normalizedCustomId ? `PUB;${normalizedCustomId}` : "";
  if (customStudy) studies.push(customStudy);
  const manualConditions = SETUP_CONDITIONS.filter(({ key }) => conditions[key])
    .map(({ key, label }) => ({ key, label, status: "manual" }));
  return {
    indicators,
    studies,
    manualConditions,
    manualOnly: verifiedStudies.length === 0 && indicators.length === 0 && manualConditions.length > 0,
    ...(customStudy ? { customScript: { id: normalizedCustomId, status: "unverified" } } : {}),
  };
}

export function indicatorChipText(indicator) {
  if (indicator.status === "manual") return `${indicator.label}: Check manually`;
  if (indicator.status === "unverified") return `${indicator.label}: Unverified id (${indicator.id})`;
  const settings = Object.entries(indicator.parameters || {});
  if (settings.length === 0) return `${indicator.label}: Sent to chart`;

  const values = settings.map(([, value]) => value);
  const parameters = settings.map(([label, value]) => `${label} ${value}`).join(", ");
  const requestedValues = values.join(" / ");
  const singleSetting = settings.length === 1 ? ` ${settings[0][0]}` : " settings";
  return `${indicator.label} ${requestedValues}: Sent to chart · sent with default${singleSetting}; set ${parameters} in chart settings`;
}
