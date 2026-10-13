const EMPTY_STUDIES = [];

function isPrimitive(value) {
  return ["string", "number", "boolean"].includes(typeof value)
    && (typeof value !== "number" || Number.isFinite(value));
}

export function assertWidgetConfigShape(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("TradingView widget config must be a plain object.");
  }

  Object.entries(config).forEach(([key, value]) => {
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
    width: "100%",
    height: "100%",
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    studies: Array.isArray(studies)
      ? studies.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())
      : [],
  };
  assertWidgetConfigShape(config);
  return config;
}
