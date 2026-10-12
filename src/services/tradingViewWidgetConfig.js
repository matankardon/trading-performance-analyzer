const EMPTY_STUDIES = [];
const STUDY_TITLES = {
  "MASimple@tv-basicstudies": "moving average",
  "MAExp@tv-basicstudies": "moving average exponential",
  "RSI@tv-basicstudies": "relative strength index",
  "MACD@tv-basicstudies": "macd",
  "BB@tv-basicstudies": "bollinger bands",
  "ADX@tv-basicstudies": "average directional index",
  "IchimokuCloud@tv-basicstudies": "ichimoku cloud",
  "StdDev@tv-basicstudies": "standard deviation",
};

function jsonSafeValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

export function buildWidgetConfig({ symbol, interval, studies = EMPTY_STUDIES } = {}) {
  const validStudies = Array.isArray(studies)
    ? studies.filter((study) => study?.applied && typeof study.id === "string" && study.id.trim())
    : [];
  const studiesOverrides = {};
  validStudies.forEach((study) => {
    if (!study.inputs || typeof study.inputs !== "object" || Array.isArray(study.inputs)) return;
    Object.entries(study.inputs).forEach(([input, value]) => {
      const safeValue = jsonSafeValue(value);
      const title = STUDY_TITLES[study.id];
      if (title && safeValue !== undefined) studiesOverrides[`${title}.${input}`] = safeValue;
    });
  });

  return {
    symbol: String(symbol ?? ""),
    interval: String(interval ?? ""),
    theme: "dark",
    locale: "en",
    timezone: "Etc/UTC",
    style: "1",
    backgroundColor: "#0D0D0D",
    gridColor: "rgba(212, 175, 55, 0.08)",
    allow_symbol_change: true,
    autosize: true,
    studies: validStudies.map(({ id }) => id),
    studies_overrides: studiesOverrides,
  };
}
