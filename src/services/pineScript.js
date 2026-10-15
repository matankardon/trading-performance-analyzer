import { sessionWindows } from "./sessionWindows";

export const PINE_SCRIPT_ID_STORAGE_KEY = "tradeCatalystTradingViewScriptIds";

const OVERLAY_INDICATORS = new Set([
  "smaConfirmation",
  "emaConfirmation",
  "bollingerConfirmation",
  "fibonacciConfirmation",
  "ichimokuConfirmation",
]);
const OSCILLATOR_INDICATORS = new Set([
  "rsiConfirmation",
  "macdConfirmation",
  "adxConfirmation",
  "stdDevConfirmation",
  "stochasticConfirmation",
]);
const NOT_GENERATED_CONDITIONS = Object.freeze([
  ["liquiditySweep", "Liquidity Sweep"],
  ["mss", "MSS"],
  ["orderBlock", "Order Block"],
  ["displacement", "Displacement"],
]);
function pineString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ")}"`;
}

function safeComment(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function isEnabled(conditions, key) {
  return conditions[key] === true;
}

function paramValue(version, key, name, fallback) {
  const value = version?.conditions?.indicatorSettings?.[key]?.[name];
  if (typeof fallback === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return typeof value === "string" && value.trim() ? value : fallback;
}

function inputInt(name, title, value, min = 1) {
  return `${name} = input.int(${value}, ${pineString(title)}, minval=${min})`;
}

function inputFloat(name, title, value, min = 0, step = 0.1) {
  return `${name} = input.float(${value}, ${pineString(title)}, minval=${min}, step=${step})`;
}

function versionHeader(version, title) {
  const displayName = String(version?.strategyName || version?.name || "Strategy").replace(/[\r\n]+/g, " ").trim() || "Strategy";
  const strategyName = safeComment(displayName);
  const displayVersion = String(version?.version ?? "unversioned").replace(/[\r\n]+/g, " ").trim();
  const versionNumber = safeComment(displayVersion);
  return [
    "//@version=6",
    `// Strategy: ${strategyName} / v${versionNumber}`,
    `indicator(${pineString(`${displayName} v${displayVersion} / ${title}`)}, overlay=${title === "Overlay" ? "true" : "false"})`,
  ];
}

function indicatorCode(version, key) {
  const code = [];
  if (key === "smaConfirmation") {
    const period = paramValue(version, key, "period", 20);
    const relation = paramValue(version, key, "priceRelation", "above");
    code.push(inputInt("smaLength", "SMA Length", period));
    code.push(`smaRelation = input.string(${pineString(relation)}, "SMA Price Relation", options=["above", "below"])`);
    code.push("smaValue = ta.sma(close, smaLength)");
    code.push('plot(smaValue, "SMA", color=color.yellow)');
  } else if (key === "emaConfirmation") {
    const period = paramValue(version, key, "period", 20);
    const relation = paramValue(version, key, "priceRelation", "above");
    code.push(inputInt("emaLength", "EMA Length", period));
    code.push(`emaRelation = input.string(${pineString(relation)}, "EMA Price Relation", options=["above", "below"])`);
    code.push("emaValue = ta.ema(close, emaLength)");
    code.push('plot(emaValue, "EMA", color=color.aqua)');
  } else if (key === "bollingerConfirmation") {
    code.push(inputInt("bbLength", "Bollinger Length", paramValue(version, key, "period", 20)));
    code.push(inputFloat("bbMultiplier", "Bollinger Deviation Multiplier", paramValue(version, key, "stdDevMultiplier", 2), 0, 0.1));
    code.push("bbBasis = ta.sma(close, bbLength)");
    code.push("bbDeviation = ta.stdev(close, bbLength, true) * bbMultiplier");
    code.push("bbUpper = bbBasis + bbDeviation");
    code.push("bbLower = bbBasis - bbDeviation");
    code.push('plot(bbUpper, "BB Upper", color=color.teal)');
    code.push('plot(bbBasis, "BB Basis", color=color.yellow)');
    code.push('plot(bbLower, "BB Lower", color=color.teal)');
  } else if (key === "fibonacciConfirmation") {
    code.push(inputInt("fibLookback", "Fibonacci Lookback", paramValue(version, key, "lookback", 50)));
    code.push("fibHigh = ta.highest(high, fibLookback)");
    code.push("fibLow = ta.lowest(low, fibLookback)");
    code.push("fibRange = fibHigh - fibLow");
    [0.236, 0.382, 0.5, 0.618, 0.786].forEach((ratio) => {
      const name = String(ratio).replace(".", "_");
      code.push(`fib${name} = fibHigh - fibRange * ${ratio}`);
      code.push(`plot(fib${name}, "Fib ${ratio}", color=color.new(color.blue, 30))`);
    });
  } else if (key === "ichimokuConfirmation") {
    code.push(inputInt("ichiConversionLength", "Ichimoku Conversion Length", paramValue(version, key, "conversionPeriod", 9)));
    code.push(inputInt("ichiBaseLength", "Ichimoku Base Length", paramValue(version, key, "basePeriod", 26)));
    code.push(inputInt("ichiSpanBLength", "Ichimoku Span B Length", paramValue(version, key, "spanBPeriod", 52)));
    code.push("ichiConversion = (ta.highest(high, ichiConversionLength) + ta.lowest(low, ichiConversionLength)) / 2");
    code.push("ichiBase = (ta.highest(high, ichiBaseLength) + ta.lowest(low, ichiBaseLength)) / 2");
    code.push("ichiSpanB = (ta.highest(high, ichiSpanBLength) + ta.lowest(low, ichiSpanBLength)) / 2");
    code.push("ichiSpanA = (ichiConversion + ichiBase) / 2");
    code.push('plot(ichiConversion, "Ichimoku Conversion", color=color.blue)');
    code.push('plot(ichiBase, "Ichimoku Base", color=color.red)');
    code.push('plot(ichiSpanA, "Ichimoku Span A", color=color.green)');
    code.push('plot(ichiSpanB, "Ichimoku Span B", color=color.orange)');
  } else if (key === "rsiConfirmation") {
    code.push(inputInt("rsiLength", "RSI Length", paramValue(version, key, "period", 14)));
    code.push(inputFloat("rsiOversold", "RSI Oversold", paramValue(version, key, "oversold", 30), 0, 1));
    code.push(inputFloat("rsiOverbought", "RSI Overbought", paramValue(version, key, "overbought", 70), 0, 1));
    code.push("rsiValue = ta.rsi(close, rsiLength)");
    code.push('plot(rsiValue, "RSI", color=color.purple)');
    code.push('hline(rsiOversold, "RSI Oversold", color=color.new(color.green, 35))');
    code.push('hline(rsiOverbought, "RSI Overbought", color=color.new(color.red, 35))');
  } else if (key === "macdConfirmation") {
    code.push(inputInt("macdFastLength", "MACD Fast Length", paramValue(version, key, "fastPeriod", 12)));
    code.push(inputInt("macdSlowLength", "MACD Slow Length", paramValue(version, key, "slowPeriod", 26)));
    code.push(inputInt("macdSignalLength", "MACD Signal Length", paramValue(version, key, "signalPeriod", 9)));
    const crossover = paramValue(version, key, "crossover", "bullish");
    code.push(`macdDirection = input.string(${pineString(crossover)}, "MACD Crossover", options=["bullish", "bearish"])`);
    code.push("[macdLine, macdSignal, macdHistogram] = ta.macd(close, macdFastLength, macdSlowLength, macdSignalLength)");
    code.push('plot(macdLine, "MACD", color=color.yellow)');
    code.push('plot(macdSignal, "MACD Signal", color=color.blue)');
    code.push('plot(macdHistogram, "MACD Histogram", style=plot.style_columns, color=macdHistogram >= 0 ? color.green : color.red)');
  } else if (key === "adxConfirmation") {
    code.push(inputInt("adxLength", "ADX Length", paramValue(version, key, "period", 14)));
    code.push(inputFloat("adxThreshold", "ADX Strength Threshold", paramValue(version, key, "threshold", 25), 0, 1));
    code.push("[plusDi, minusDi, adxValue] = ta.dmi(adxLength, adxLength)");
    code.push('plot(adxValue, "ADX", color=color.teal)');
    code.push('hline(adxThreshold, "ADX Threshold", color=color.gray)');
  } else if (key === "stdDevConfirmation") {
    code.push(inputInt("stdDevLength", "Standard Deviation Length", paramValue(version, key, "period", 20)));
    code.push("stdDevValue = ta.stdev(close, stdDevLength, true)");
    code.push('plot(stdDevValue, "Standard Deviation", color=color.teal)');
  } else if (key === "stochasticConfirmation") {
    code.push(inputInt("stochKLength", "Stochastic K Length", paramValue(version, key, "kPeriod", 14)));
    code.push(inputInt("stochDLength", "Stochastic D Length", paramValue(version, key, "dPeriod", 3)));
    code.push(inputFloat("stochOversold", "Stochastic Oversold", paramValue(version, key, "oversold", 20), 0, 1));
    code.push(inputFloat("stochOverbought", "Stochastic Overbought", paramValue(version, key, "overbought", 80), 0, 1));
    code.push("stochK = ta.stoch(close, high, low, stochKLength)");
    code.push("stochD = ta.sma(stochK, stochDLength)");
    code.push('plot(stochK, "Stochastic %K", color=color.yellow)');
    code.push('plot(stochD, "Stochastic %D", color=color.blue)');
    code.push('hline(stochOversold, "Stochastic Oversold", color=color.new(color.green, 35))');
    code.push('hline(stochOverbought, "Stochastic Overbought", color=color.new(color.red, 35))');
  }
  return code;
}

function sessionConfiguration(version) {
  const session = String(version?.session ?? "").trim();
  if (!session || ["all", "all sessions"].includes(session.toLowerCase())) return null;
  const definition = sessionWindows[session];
  const formatTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}${String(minutes % 60).padStart(2, "0")}`;
  const window = definition ? `${formatTime(definition.start)}-${formatTime(definition.end)}` : null;
  return window ? { label: session, window } : { label: session, window: null };
}

function conditionCode(version, emittedConditions, notIncluded) {
  const conditions = version?.conditions || {};
  const code = [];
  const setupTerms = [];

  if (isEnabled(conditions, "fvg")) {
    code.push("// App-equivalent 3-bar FVG detection: current bar gaps over two bars ago.");
    code.push("bullishFvg = bar_index >= 2 and low > high[2]");
    code.push("bearishFvg = bar_index >= 2 and high < low[2]");
    code.push("fvgDetected = bullishFvg or bearishFvg");
    code.push("if bullishFvg");
    code.push("    box.new(bar_index - 2, low, bar_index, high[2], bgcolor=color.new(color.green, 86), border_color=color.new(color.green, 45))");
    code.push("if bearishFvg");
    code.push("    box.new(bar_index - 2, low[2], bar_index, high, bgcolor=color.new(color.red, 86), border_color=color.new(color.red, 45))");
    setupTerms.push("fvgDetected");
    emittedConditions.push("FVG (3-bar gap)");
  }

  const session = sessionConfiguration(version);
  if (session?.window) {
    code.push(`strategySession = input.session(${pineString(session.window)}, ${pineString(`${session.label} Session · New York`)})`);
    code.push('inStrategySession = not na(time(timeframe.period, strategySession, "America/New_York"))');
    code.push("bgcolor(inStrategySession ? color.new(color.yellow, 92) : na)");
    setupTerms.push("inStrategySession");
    emittedConditions.push(`Session (${session.label}, America/New_York)`);
  } else if (session) {
    notIncluded.push(`Session (${session.label}: no matching app session definition)`);
  }

  if (isEnabled(conditions, "stochasticConfirmation")) {
    const kPeriod = paramValue(version, "stochasticConfirmation", "kPeriod", 14);
    const dPeriod = paramValue(version, "stochasticConfirmation", "dPeriod", 3);
    code.push(inputInt("setupStochKLength", "Setup Stochastic K Length", kPeriod));
    code.push(inputInt("setupStochDLength", "Setup Stochastic D Length", dPeriod));
    code.push("setupStochK = ta.stoch(close, high, low, setupStochKLength)");
    code.push("setupStochD = ta.sma(setupStochK, setupStochDLength)");
    code.push("// Confirmation mirrors app isStochasticConfirming: fixed 20/80 turn boundaries.");
    code.push("stochasticBullish = setupStochK[1] < 20 and setupStochK[1] <= setupStochD[1] and setupStochK > setupStochD");
    code.push("stochasticBearish = setupStochK[1] > 80 and setupStochK[1] >= setupStochD[1] and setupStochK < setupStochD");
    code.push("stochasticConfirmed = stochasticBullish or stochasticBearish");
    setupTerms.push("stochasticConfirmed");
    emittedConditions.push("Stochastic Confirmation");
  }

  if (setupTerms.length) {
    code.push(`setupAligned = ${setupTerms.join(" and ")}`);
    code.push('plotshape(setupAligned, title="Setup", text="SETUP", style=shape.labelup, location=location.belowbar, color=color.new(color.yellow, 0), textcolor=color.black)');
    code.push('alertcondition(setupAligned, title="Emitted setup conditions aligned", message="Generated emitted setup conditions aligned on this bar.")');
    if (notIncluded.length) {
      code.push(`// Alert covers emitted conditions only. Manually verify: ${notIncluded.join(", ")}.`);
    }
  }

  return { code, setupTerms, emittedConditions };
}

function createScript(version, title, indicatorKeys, setupTarget, notIncluded, notes) {
  const code = versionHeader(version, title);
  const emittedConditions = [];

  if (setupTarget) {
    const generated = conditionCode(version, emittedConditions, notIncluded);
    code.push(...generated.code);
  }
  indicatorKeys.filter((key) => key !== "fvg").forEach((key) => code.push(...indicatorCode(version, key)));

  NOT_GENERATED_CONDITIONS.forEach(([key, label]) => {
    if (isEnabled(version?.conditions || {}, key)) code.push(`// Not generated: ${label}; check this condition manually.`);
  });

  if (version?.conditions?.fvg && title === "Overlay") {
    notes.push("The FVG drawing uses the app's exact 3-bar gap definition; its same-bar alert does not reproduce later retest and setup-sequence context.");
  }
  if (version?.conditions?.stochasticConfirmation && setupTarget) {
    notes.push("Stochastic confirmation mirrors the app's K/D turn rule; its confirmation thresholds remain fixed at 20 and 80.");
  }
  if (notIncluded.length) {
    notes.push(`Alert conditions include only generated gates; manually validate: ${notIncluded.join(", ")}.`);
  }

  return { id: title.toLowerCase(), title, code: [...code, ""].join("\n") };
}

export function generatePine(version = {}) {
  const conditions = version?.conditions && typeof version.conditions === "object" ? version.conditions : {};
  const notIncluded = NOT_GENERATED_CONDITIONS
    .filter(([key]) => isEnabled(conditions, key))
    .map(([, label]) => label);
  const notes = [];
  const overlayIndicators = [...OVERLAY_INDICATORS].filter((key) => isEnabled(conditions, key));
  const oscillatorIndicators = [...OSCILLATOR_INDICATORS].filter((key) => isEnabled(conditions, key));
  const fvgEnabled = isEnabled(conditions, "fvg");
  const session = sessionConfiguration(version);

  if (session && !session.window) notIncluded.push(`Session (${session.label}: no matching app session definition)`);
  const wantsOverlay = overlayIndicators.length > 0 || fvgEnabled || Boolean(session?.window);
  const wantsOscillators = oscillatorIndicators.length > 0;
  const hasGeneratedConditions = fvgEnabled || Boolean(session?.window)
    || isEnabled(conditions, "stochasticConfirmation");
  const scripts = [];
  if (wantsOverlay) {
    const keys = [...overlayIndicators, ...(fvgEnabled ? ["fvg"] : [])];
    scripts.push(createScript(version, "Overlay", keys, hasGeneratedConditions, notIncluded, notes));
  }
  if (wantsOscillators) {
    scripts.push(createScript(version, "Oscillators", oscillatorIndicators, !wantsOverlay && hasGeneratedConditions, notIncluded, notes));
  }
  const uniqueNotIncluded = [...new Set(notIncluded)];
  if (!scripts.length) {
    uniqueNotIncluded.push("No supported indicator or setup condition is enabled; nothing can be generated.");
  }

  return { scripts, notes: [...new Set(notes)], notIncluded: [...new Set(uniqueNotIncluded)] };
}

function readScriptIdMap() {
  try {
    const stored = JSON.parse(localStorage.getItem(PINE_SCRIPT_ID_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

export function readPineScriptId(versionId) {
  if (!versionId) return "";
  const value = readScriptIdMap()[versionId];
  return typeof value === "string" ? value : "";
}

export function writePineScriptId(versionId, value) {
  if (!versionId) return false;
  const id = String(value ?? "").trim();
  if (id && !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return false;
  const next = readScriptIdMap();
  if (id) next[versionId] = id;
  else delete next[versionId];
  try {
    localStorage.setItem(PINE_SCRIPT_ID_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
