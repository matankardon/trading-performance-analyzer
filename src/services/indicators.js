function validateBars(bars) {
  if (!Array.isArray(bars)) throw new Error("bars must be an array.");
  bars.forEach((bar, index) => {
    if (!bar || !["high", "low", "close"].every((field) => Number.isFinite(bar[field]))) {
      throw new Error(`bar at index ${index} must contain numeric high, low, and close values.`);
    }
  });
}

function validatePeriod(period, name) {
  if (!Number.isInteger(period) || period < 1) throw new Error(`${name} must be a positive integer.`);
}

function rollingMean(values, period, index) {
  if (index < period - 1) return null;
  const sample = values.slice(index - period + 1, index + 1);
  if (sample.some((value) => !Number.isFinite(value))) return null;
  return sample.reduce((sum, value) => sum + value, 0) / period;
}

function emaValues(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    previous = alpha * values[index] + (1 - alpha) * previous;
    result[index] = previous;
  }
  return result;
}

export function calculateSMA(bars, period = 20) {
  validateBars(bars);
  validatePeriod(period, "period");
  const closes = bars.map((bar) => bar.close);
  return closes.map((_, index) => rollingMean(closes, period, index));
}

export function calculateEMA(bars, period = 20) {
  validateBars(bars);
  validatePeriod(period, "period");
  return emaValues(bars.map((bar) => bar.close), period);
}

export function calculateRSI(bars, period = 14) {
  validateBars(bars);
  validatePeriod(period, "period");
  const result = Array(bars.length).fill(null);
  if (bars.length <= period) return result;

  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = bars[index].close - bars[index - 1].close;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;
  const value = () => averageLoss === 0
    ? (averageGain === 0 ? 50 : 100)
    : 100 - (100 / (1 + averageGain / averageLoss));
  result[period] = value();

  for (let index = period + 1; index < bars.length; index += 1) {
    const change = bars[index].close - bars[index - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = value();
  }
  return result;
}

export function calculateMACD(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  validateBars(bars);
  validatePeriod(fastPeriod, "fastPeriod");
  validatePeriod(slowPeriod, "slowPeriod");
  validatePeriod(signalPeriod, "signalPeriod");
  if (fastPeriod >= slowPeriod) throw new Error("fastPeriod must be smaller than slowPeriod.");
  const closes = bars.map((bar) => bar.close);
  const fast = emaValues(closes, fastPeriod);
  const slow = emaValues(closes, slowPeriod);
  const macdLine = bars.map((_, index) => (
    Number.isFinite(fast[index]) && Number.isFinite(slow[index]) ? fast[index] - slow[index] : null
  ));
  const firstMacdIndex = slowPeriod - 1;
  const compactMacd = macdLine.slice(firstMacdIndex);
  const compactSignal = emaValues(compactMacd, signalPeriod);
  return bars.map((_, index) => {
    const compactIndex = index - firstMacdIndex;
    const macd = macdLine[index];
    const signal = compactIndex >= 0 ? compactSignal[compactIndex] : null;
    return Number.isFinite(macd) && Number.isFinite(signal)
      ? { macd, signal, histogram: macd - signal }
      : null;
  });
}

export function calculateBollingerBands(bars, period = 20, stdDevMultiplier = 2) {
  validateBars(bars);
  validatePeriod(period, "period");
  if (!Number.isFinite(stdDevMultiplier) || stdDevMultiplier < 0) {
    throw new Error("stdDevMultiplier must be a non-negative number.");
  }
  return bars.map((_, index) => {
    const middle = rollingMean(bars.map((bar) => bar.close), period, index);
    if (middle === null) return null;
    const sample = bars.slice(index - period + 1, index + 1).map((bar) => bar.close);
    const variance = sample.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const deviation = Math.sqrt(variance) * stdDevMultiplier;
    return { upper: middle + deviation, middle, lower: middle - deviation };
  });
}

export function calculateADX(bars, period = 14) {
  validateBars(bars);
  validatePeriod(period, "period");
  const result = Array(bars.length).fill(null);
  if (bars.length <= period * 2 - 1) return result;

  const trueRanges = [];
  const positiveMoves = [];
  const negativeMoves = [];
  for (let index = 1; index < bars.length; index += 1) {
    const current = bars[index];
    const previous = bars[index - 1];
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    trueRanges[index] = Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
    positiveMoves[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    negativeMoves[index] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothedTr = trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPositive = positiveMoves.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedNegative = negativeMoves.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  const dxValues = Array(bars.length).fill(null);
  for (let index = period; index < bars.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - smoothedTr / period + trueRanges[index];
      smoothedPositive = smoothedPositive - smoothedPositive / period + positiveMoves[index];
      smoothedNegative = smoothedNegative - smoothedNegative / period + negativeMoves[index];
    }
    const positiveDi = smoothedTr ? (smoothedPositive / smoothedTr) * 100 : 0;
    const negativeDi = smoothedTr ? (smoothedNegative / smoothedTr) * 100 : 0;
    const sumDi = positiveDi + negativeDi;
    dxValues[index] = sumDi ? (Math.abs(positiveDi - negativeDi) / sumDi) * 100 : 0;
  }

  const firstAdxIndex = period * 2 - 1;
  let adx = dxValues.slice(period, firstAdxIndex + 1).reduce((sum, value) => sum + value, 0) / period;
  result[firstAdxIndex] = adx;
  for (let index = firstAdxIndex + 1; index < bars.length; index += 1) {
    adx = (adx * (period - 1) + dxValues[index]) / period;
    result[index] = adx;
  }
  return result;
}

export function calculateFibonacciLevels(bars, lookback = 50) {
  validateBars(bars);
  validatePeriod(lookback, "lookback");
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  return bars.map((_, index) => {
    if (index < lookback - 1) return null;
    const window = bars.slice(index - lookback + 1, index + 1);
    const swingHigh = Math.max(...window.map((bar) => bar.high));
    const swingLow = Math.min(...window.map((bar) => bar.low));
    const range = swingHigh - swingLow;
    return {
      swingHigh,
      swingLow,
      levels: Object.fromEntries(ratios.map((ratio) => [ratio, swingHigh - range * ratio])),
    };
  });
}

export function calculateIchimoku(bars, conversionPeriod = 9, basePeriod = 26, spanBPeriod = 52) {
  validateBars(bars);
  validatePeriod(conversionPeriod, "conversionPeriod");
  validatePeriod(basePeriod, "basePeriod");
  validatePeriod(spanBPeriod, "spanBPeriod");
  const midpoint = (index, period) => {
    if (index < period - 1) return null;
    const window = bars.slice(index - period + 1, index + 1);
    return (Math.max(...window.map((bar) => bar.high)) + Math.min(...window.map((bar) => bar.low))) / 2;
  };
  return bars.map((_, index) => {
    const conversionLine = midpoint(index, conversionPeriod);
    const baseLine = midpoint(index, basePeriod);
    const spanB = midpoint(index, spanBPeriod);
    if ([conversionLine, baseLine, spanB].some((value) => value === null)) return null;
    return { conversionLine, baseLine, spanA: (conversionLine + baseLine) / 2, spanB };
  });
}

export function calculateStdDev(bars, period = 20) {
  validateBars(bars);
  validatePeriod(period, "period");
  const closes = bars.map((bar) => bar.close);
  return bars.map((_, index) => {
    const mean = rollingMean(closes, period, index);
    if (mean === null) return null;
    const window = closes.slice(index - period + 1, index + 1);
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  });
}
