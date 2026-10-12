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

function isPrimitive(value) {
  return ["string", "number", "boolean"].includes(typeof value)
    && (typeof value !== "number" || Number.isFinite(value));
}

export function assertWidgetConfigShape(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("TradingView widget config must be a plain object.");
  }

  Object.entries(config).forEach(([key, value]) => {
    if (key === "studies_overrides") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("TradingView studies_overrides must be a flat object.");
      }
      Object.entries(value).forEach(([overrideKey, overrideValue]) => {
        if (!overrideKey || !isPrimitive(overrideValue)) {
          throw new TypeError("TradingView study overrides must have primitive values.");
        }
      });
      return;
    }

    if (Array.isArray(value)) {
      if (!value.every(isPrimitive)) {
        throw new TypeError(`TradingView widget config array "${key}" must contain only primitives.`);
      }
      return;
    }

    if (!isPrimitive(value)) {
      throw new TypeError(`TradingView widget config value "${key}" must be primitive.`);
    }
  });
  return true;
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
      if (title && safeValue !== undefined && typeof input === "string" && input.trim()) {
        studiesOverrides[`${title}.${input}`] = safeValue;
      }
    });
  });

  const config = {
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
  assertWidgetConfigShape(config);
  return config;
}
