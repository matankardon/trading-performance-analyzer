function validateBars(bars) {
  if (!Array.isArray(bars)) {
    throw new Error("bars must be an array.");
  }

  bars.forEach((bar, index) => {
    if (!bar || !["high", "low", "close"].every((field) => Number.isFinite(bar[field]))) {
      throw new Error(`bar at index ${index} must contain numeric high, low, and close values.`);
    }
  });
}

function validatePeriod(period, name) {
  if (!Number.isInteger(period) || period < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

export function calculateStochastic(bars, kPeriod = 14, dPeriod = 3) {
  validateBars(bars);
  validatePeriod(kPeriod, "kPeriod");
  validatePeriod(dPeriod, "dPeriod");

  const kValues = Array(bars.length).fill(null);
  const dValues = Array(bars.length).fill(null);
  const result = Array(bars.length).fill(null);

  for (let index = kPeriod - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - kPeriod + 1, index + 1);
    const highestHigh = Math.max(...window.map((bar) => bar.high));
    const lowestLow = Math.min(...window.map((bar) => bar.low));
    const range = highestHigh - lowestLow;
    if (range > 0) {
      kValues[index] = ((bars[index].close - lowestLow) / range) * 100;
    }

    const dStart = index - dPeriod + 1;
    if (dStart >= kPeriod - 1) {
      const dWindow = kValues.slice(dStart, index + 1);
      if (dWindow.every((value) => Number.isFinite(value))) {
        dValues[index] = dWindow.reduce((total, value) => total + value, 0) / dPeriod;
        result[index] = {
          k: kValues[index],
          d: dValues[index],
          previousK: index > 0 ? kValues[index - 1] : null,
          previousD: index > 0 ? dValues[index - 1] : null,
        };
      }
    }
  }

  return result;
}

export function isStochasticConfirming(stochValue, direction) {
  if (!stochValue || !["long", "short", "bullish", "bearish"].includes(direction)) {
    return false;
  }

  const { k, d, previousK, previousD } = stochValue;
  if (![k, d, previousK, previousD].every(Number.isFinite)) {
    return false;
  }

  const bullish = direction === "long" || direction === "bullish";
  if (bullish) {
    return previousK < 20 && previousK <= previousD && k > d;
  }
  return previousK > 80 && previousK >= previousD && k < d;
}