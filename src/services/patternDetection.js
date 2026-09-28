function validateBars(bars) {
  if (!Array.isArray(bars)) {
    throw new Error("bars must be an array.");
  }

  bars.forEach((bar, index) => {
    if (!bar || !["open", "high", "low", "close"].every((field) => Number.isFinite(bar[field]))) {
      throw new Error(`bar at index ${index} must contain numeric open, high, low, and close values.`);
    }
  });
}

export function detectFVGs(bars) {
  validateBars(bars);
  const gaps = [];

  for (let index = 1; index < bars.length - 1; index += 1) {
    const previous = bars[index - 1];
    const next = bars[index + 1];

    if (previous.high < next.low) {
      gaps.push({
        index,
        confirmedAt: index + 1,
        type: "bullish",
        top: next.low,
        bottom: previous.high,
      });
    }
    if (previous.low > next.high) {
      gaps.push({
        index,
        confirmedAt: index + 1,
        type: "bearish",
        top: previous.low,
        bottom: next.high,
      });
    }
  }

  return gaps;
}

export function detectLiquiditySweeps(bars, lookback = 5) {
  validateBars(bars);
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new Error("lookback must be a positive integer.");
  }

  const sweeps = [];

  for (let index = lookback; index < bars.length; index += 1) {
    const priorBars = bars.slice(index - lookback, index);
    const priorHigh = Math.max(...priorBars.map((bar) => bar.high));
    const priorLow = Math.min(...priorBars.map((bar) => bar.low));
    const current = bars[index];
    const next = bars[index + 1];

    if (current.high > priorHigh && (current.close < priorHigh || (next && next.close < priorHigh))) {
      sweeps.push({
        index,
        confirmedAt: current.close < priorHigh ? index : index + 1,
        type: "high",
        sweptLevel: priorHigh,
        reversed: true,
      });
    }
    if (current.low < priorLow && (current.close > priorLow || (next && next.close > priorLow))) {
      sweeps.push({
        index,
        confirmedAt: current.close > priorLow ? index : index + 1,
        type: "low",
        sweptLevel: priorLow,
        reversed: true,
      });
    }
  }

  return sweeps;
}