import { calculateEMA, calculateMACD, calculateRSI } from "./indicators";
import { detectSwingPoints } from "./structureDetection";

export const WEIGHTS = Object.freeze({
  trend: 25,
  structure: 25,
  momentum: 20,
  volatility: 20,
  volume: 10,
});

export const BAND_THRESHOLDS = Object.freeze({
  favorable: 70,
  mixed: 45,
});

export const MIN_BARS = 200;

const ATR_PERIOD = 14;
const SWING_WINDOW = 2;
const STRUCTURE_SWINGS = 4;

function assertBars(bars) {
  if (!Array.isArray(bars)) {
    throw new Error("bars must be an array.");
  }
  bars.forEach((bar, index) => {
    if (!bar || !["open", "high", "low", "close"].every((field) => Number.isFinite(bar[field]))) {
      throw new Error(`bar at index ${index} must contain numeric open, high, low, and close values.`);
    }
  });
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function rounded(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function calculateATRValues(bars, period = ATR_PERIOD) {
  const trueRanges = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low;
    const previousClose = bars[index - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });

  return trueRanges.map((_, index) => {
    if (index < period - 1) return null;
    const sample = trueRanges.slice(index - period + 1, index + 1);
    return sample.reduce((total, value) => total + value, 0) / period;
  });
}

function component(key, label, score, direction, value, explanation, available = true) {
  return {
    key,
    label,
    score: rounded(clamp(score)),
    direction,
    available,
    value,
    explanation,
  };
}

function trendComponent(bars, atrValues) {
  const ema20 = calculateEMA(bars, 20);
  const ema50 = calculateEMA(bars, 50);
  const ema200 = calculateEMA(bars, 200);
  const last = bars.length - 1;
  const slopeIndex = Math.max(0, last - 10);
  const atr = atrValues[last];
  const slope = ema50[last] - ema50[slopeIndex];
  const normalizedSlope = atr > 0 ? slope / atr : 0;
  const bullishAlignment = ema20[last] > ema50[last] && ema50[last] > ema200[last];
  const bearishAlignment = ema20[last] < ema50[last] && ema50[last] < ema200[last];
  const aligned = bullishAlignment || bearishAlignment;
  const direction = normalizedSlope > 0
    ? 1
    : normalizedSlope < 0
      ? -1
      : bullishAlignment
        ? 1
        : bearishAlignment
          ? -1
          : 0;
  const slopeAgrees = aligned && (bullishAlignment ? normalizedSlope > 0 : normalizedSlope < 0);
  const score = aligned
    ? 80 + Math.min(20, Math.abs(normalizedSlope) * 5) * (slopeAgrees ? 1 : 0.25)
    : 30 + Math.min(20, Math.abs(normalizedSlope) * 5);

  return component(
    "trend",
    "Trend",
    score,
    direction,
    `EMA20 ${ema20[last].toFixed(2)}, EMA50 ${ema50[last].toFixed(2)}, EMA200 ${ema200[last].toFixed(2)}; EMA50 slope ${normalizedSlope.toFixed(2)} ATR`,
    aligned
      ? `The EMAs are aligned ${bullishAlignment ? "upward" : "downward"} with a ${Math.abs(normalizedSlope).toFixed(2)}-ATR EMA50 slope.`
      : "The EMAs are not fully aligned, so the broader trend is less clear.",
  );
}

function structureComponent(bars) {
  const swings = detectSwingPoints(bars, SWING_WINDOW);
  const highs = swings.filter(({ type }) => type === "high").slice(-STRUCTURE_SWINGS);
  const lows = swings.filter(({ type }) => type === "low").slice(-STRUCTURE_SWINGS);
  if (highs.length < 2 || lows.length < 2) {
    return component(
      "structure",
      "Structure",
      20,
      0,
      `Highs ${highs.length}/${STRUCTURE_SWINGS}, lows ${lows.length}/${STRUCTURE_SWINGS}`,
      "There are not enough confirmed swing highs and lows to establish structure.",
    );
  }

  const highMoves = highs.slice(1).map((point, index) => Math.sign(point.price - highs[index].price));
  const lowMoves = lows.slice(1).map((point, index) => Math.sign(point.price - lows[index].price));
  const allMoves = [...highMoves, ...lowMoves];
  const upCount = allMoves.filter((move) => move > 0).length;
  const downCount = allMoves.filter((move) => move < 0).length;
  const bullish = highMoves.every((move) => move > 0) && lowMoves.every((move) => move > 0);
  const bearish = highMoves.every((move) => move < 0) && lowMoves.every((move) => move < 0);
  const direction = bullish ? 1 : bearish ? -1 : 0;
  const clarity = Math.max(upCount, downCount) / allMoves.length;
  const score = bullish || bearish ? 90 : 25 + clarity * 25;

  return component(
    "structure",
    "Structure",
    score,
    direction,
    `Last swing highs ${highs.map(({ price }) => price.toFixed(2)).join(", ")}; lows ${lows.map(({ price }) => price.toFixed(2)).join(", ")}`,
    bullish
      ? "Recent swing highs and lows are consistently rising."
      : bearish
        ? "Recent swing highs and lows are consistently falling."
        : "Recent swing highs and lows are mixed rather than consistently directional.",
  );
}

function momentumComponent(bars, atrValues) {
  const rsiValues = calculateRSI(bars, 14);
  const macdValues = calculateMACD(bars);
  const last = bars.length - 1;
  const rsi = rsiValues[last];
  const histogram = macdValues[last].histogram;
  const atr = atrValues[last];
  const rsiDirection = rsi > 50 ? 1 : rsi < 50 ? -1 : 0;
  const histogramDirection = histogram > 0 ? 1 : histogram < 0 ? -1 : 0;
  const direction = rsiDirection === histogramDirection
    ? rsiDirection
    : rsiDirection === 0
      ? histogramDirection
      : histogramDirection === 0
        ? rsiDirection
        : 0;
  const stretched = rsi > 75 || rsi < 25;
  const aligned = rsiDirection !== 0 && rsiDirection === histogramDirection;
  const histogramStrength = atr > 0 ? Math.min(10, Math.abs(histogram / atr) * 100) : 0;
  const score = aligned
    ? (stretched ? 75 : 82) + histogramStrength
    : direction === 0
      ? 40
      : stretched
        ? 55
        : 62;

  return component(
    "momentum",
    "Momentum",
    score,
    direction,
    `RSI14 ${rsi.toFixed(2)}, MACD histogram ${histogram.toFixed(4)}`,
    `${aligned ? "RSI and MACD histogram are aligned" : "RSI and MACD histogram provide incomplete alignment"}${stretched ? "; RSI is stretched beyond 75 or below 25" : ""}.`,
  );
}

function volatilityComponent(bars, atrValues) {
  const first = Math.max(ATR_PERIOD - 1, bars.length - 100);
  const samples = bars.slice(first).map((bar, offset) => {
    const atr = atrValues[first + offset];
    if (atr === null) return null;
    return bar.close === 0 ? (atr === 0 ? 0 : 100) : (atr / Math.abs(bar.close)) * 100;
  }).filter(Number.isFinite);
  const lastRatio = samples.at(-1);
  const lessThan = samples.filter((value) => value < lastRatio).length;
  const equal = samples.filter((value) => value === lastRatio).length;
  const percentile = samples.length ? (lessThan + equal / 2) / samples.length : 0.5;
  let score = clamp(100 - Math.abs(percentile - 0.5) * 120);
  if (lastRatio < 0.05) score *= 0.5;
  if (lastRatio > 3) score *= 0.5;

  return component(
    "volatility",
    "Volatility",
    score,
    null,
    `ATR14 ${atrValues.at(-1).toFixed(4)} (${lastRatio.toFixed(3)}% of price), ${Math.round(percentile * 100)}th percentile`,
    lastRatio < 0.05
      ? "Volatility is unusually subdued and may leave too little movement for short-term trading."
      : lastRatio > 3
        ? "Volatility is unusually high and may make short-term conditions erratic."
        : "Volatility is assessed against its trailing 100-bar range, with a mid-range reading preferred.",
  );
}

function volumeComponent(bars, volumeKind) {
  const sample = bars.slice(-50);
  const volumes = sample.map(({ volume }) => volume);
  if (volumes.some((volume) => !Number.isFinite(volume) || volume < 0)) {
    return component(
      "volume",
      "Volume",
      0,
      null,
      "Unavailable",
      "Volume data is missing or invalid, so relative activity cannot be assessed.",
      false,
    );
  }

  const averageVolume = volumes.reduce((total, volume) => total + volume, 0) / volumes.length;
  if (averageVolume === 0) {
    return component(
      "volume",
      "Volume",
      0,
      null,
      "Unavailable",
      "Volume is zero across the trailing 50 bars, so relative activity cannot be assessed.",
      false,
    );
  }

  const recentAverage = volumes.slice(-5).reduce((total, volume) => total + volume, 0) / 5;
  const relativeVolume = recentAverage / averageVolume;
  const score = relativeVolume < 0.5
    ? relativeVolume * 100
    : relativeVolume <= 1.5
      ? 100
      : Math.max(0, 100 - (relativeVolume - 1.5) * 40);
  const volumeLabel = volumeKind === "tick" ? "tick volume" : "volume";

  return component(
    "volume",
    "Volume",
    score,
    null,
    `Relative ${volumeLabel} ${relativeVolume.toFixed(2)}x`,
    `The last 5 bars averaged ${relativeVolume.toFixed(2)} times the trailing 50-bar ${volumeLabel} average.`,
  );
}

export function getMarketScoreBand(score) {
  if (!Number.isFinite(score)) return null;
  if (score >= BAND_THRESHOLDS.favorable) return "Favorable";
  if (score >= BAND_THRESHOLDS.mixed) return "Mixed";
  return "Unfavorable";
}

export function computeMarketScore(bars, { timeframe, volumeKind } = {}) {
  assertBars(bars);
  if (bars.length < MIN_BARS) {
    return {
      available: false,
      score: null,
      band: null,
      bias: "Mixed",
      biasDetail: { trend: null, structure: null, momentum: null },
      components: [],
      reasons: ["Not enough history: at least 200 closed bars are required."],
    };
  }

  const atrValues = calculateATRValues(bars);
  const components = [
    trendComponent(bars, atrValues),
    structureComponent(bars),
    momentumComponent(bars, atrValues),
    volatilityComponent(bars, atrValues),
    volumeComponent(bars, volumeKind),
  ];
  const availableComponents = components.filter(({ available }) => available);
  const availableWeight = availableComponents.reduce((total, { key }) => total + WEIGHTS[key], 0);
  const biasDetail = Object.fromEntries(
    components
      .filter(({ key }) => ["trend", "structure", "momentum"].includes(key))
      .map(({ key, direction }) => [key, direction]),
  );
  const directions = [biasDetail.trend, biasDetail.structure, biasDetail.momentum];
  const bias = directions.every((direction) => direction === 1)
    ? "Bullish"
    : directions.every((direction) => direction === -1)
      ? "Bearish"
      : "Mixed";

  if (availableComponents.length < 3 || availableWeight === 0) {
    return {
      available: false,
      score: null,
      band: null,
      bias,
      biasDetail,
      components,
      reasons: ["Fewer than three score components have usable data."],
    };
  }

  const weightedTotal = availableComponents.reduce(
    (total, { key, score }) => total + score * WEIGHTS[key],
    0,
  );
  const score = rounded(weightedTotal / availableWeight);
  return {
    available: true,
    score,
    band: getMarketScoreBand(score),
    bias,
    biasDetail,
    components,
    reasons: timeframe ? [`Environment quality for short-term trading on ${timeframe}; this is not a price forecast.`] : [
      "Environment quality for short-term trading; this is not a price forecast.",
    ],
  };
}

export function keyLevels(bars) {
  assertBars(bars);
  if (bars.some(({ timestamp }) => !Number.isFinite(timestamp))) {
    throw new Error("Every bar must have a finite timestamp to calculate UTC day levels.");
  }

  const dayBars = new Map();
  bars.forEach((bar) => {
    const date = new Date(bar.timestamp);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Every bar timestamp must be a valid date.");
    }
    const day = date.toISOString().slice(0, 10);
    if (!dayBars.has(day)) dayBars.set(day, []);
    dayBars.get(day).push(bar);
  });
  const days = [...dayBars.keys()].sort();
  const currentDay = dayBars.get(days.at(-1)) ?? [];
  const previousDay = days.length > 1 ? dayBars.get(days.at(-2)) : [];
  const swings = detectSwingPoints(bars, SWING_WINDOW);
  const swingHighs = swings.filter(({ type }) => type === "high");
  const swingLows = swings.filter(({ type }) => type === "low");
  const atrValues = calculateATRValues(bars);
  const latestHigh = swingHighs.at(-1)?.price ?? null;
  const latestLow = swingLows.at(-1)?.price ?? null;

  return {
    previousDayHigh: previousDay.length ? Math.max(...previousDay.map(({ high }) => high)) : null,
    previousDayLow: previousDay.length ? Math.min(...previousDay.map(({ low }) => low)) : null,
    previousDayClose: previousDay.at(-1)?.close ?? null,
    currentDayOpen: currentDay[0]?.open ?? null,
    currentDayHigh: currentDay.length ? Math.max(...currentDay.map(({ high }) => high)) : null,
    currentDayLow: currentDay.length ? Math.min(...currentDay.map(({ low }) => low)) : null,
    latestSwingHigh: latestHigh,
    latestSwingLow: latestLow,
    atr14: atrValues.at(-1) ?? null,
    dayBoundary: "UTC",
  };
}
