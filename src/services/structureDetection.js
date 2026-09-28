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

export function detectSwingPoints(bars, n = 2) {
  validateBars(bars);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("n must be a positive integer.");
  }

  const swingPoints = [];
  for (let index = n; index < bars.length - n; index += 1) {
    const current = bars[index];
    const neighbors = [
      ...bars.slice(index - n, index),
      ...bars.slice(index + 1, index + n + 1),
    ];

    if (neighbors.every((bar) => current.high > bar.high)) {
      swingPoints.push({ index, confirmedAt: index + n, type: "high", price: current.high });
    }
    if (neighbors.every((bar) => current.low < bar.low)) {
      swingPoints.push({ index, confirmedAt: index + n, type: "low", price: current.low });
    }
  }

  return swingPoints;
}

function validateSwingPoints(swingPoints, barsLength) {
  if (!Array.isArray(swingPoints)) {
    throw new Error("swingPoints must be an array.");
  }

  swingPoints.forEach((point, pointIndex) => {
    if (
      !point
      || !Number.isInteger(point.index)
      || point.index < 0
      || point.index >= barsLength
      || !["high", "low"].includes(point.type)
      || !Number.isFinite(point.price)
    ) {
      throw new Error(`swing point at index ${pointIndex} is invalid.`);
    }
  });
}

export function detectMSS(bars, swingPoints) {
  validateBars(bars);
  validateSwingPoints(swingPoints, bars.length);
  const events = [];
  const orderedPoints = [...swingPoints].sort((left, right) => left.index - right.index);

  for (let index = 1; index < bars.length; index += 1) {
    const priorPoints = orderedPoints.filter((point) => (
      point.index < index && (point.confirmedAt ?? point.index) <= index
    ));
    const swingHighs = priorPoints.filter((point) => point.type === "high");
    const swingLows = priorPoints.filter((point) => point.type === "low");
    if (swingHighs.length < 2 || swingLows.length < 2) continue;

    const priorHigh = swingHighs[swingHighs.length - 2];
    const latestHigh = swingHighs[swingHighs.length - 1];
    const priorLow = swingLows[swingLows.length - 2];
    const latestLow = swingLows[swingLows.length - 1];
    const previousClose = bars[index - 1].close;
    const currentClose = bars[index].close;

    const downtrend = latestHigh.price < priorHigh.price && latestLow.price < priorLow.price;
    if (downtrend && previousClose <= latestHigh.price && currentClose > latestHigh.price) {
      events.push({ index, confirmedAt: index, type: "bullish", brokenLevel: latestHigh.price });
      continue;
    }

    const uptrend = latestHigh.price > priorHigh.price && latestLow.price > priorLow.price;
    if (uptrend && previousClose >= latestLow.price && currentClose < latestLow.price) {
      events.push({ index, confirmedAt: index, type: "bearish", brokenLevel: latestLow.price });
    }
  }

  return events;
}

export function detectOrderBlocks(bars, mssEvents) {
  validateBars(bars);
  if (!Array.isArray(mssEvents)) {
    throw new Error("mssEvents must be an array.");
  }

  return mssEvents.flatMap((event, eventIndex) => {
    if (
      !event
      || !Number.isInteger(event.index)
      || event.index < 0
      || event.index >= bars.length
      || !["bullish", "bearish"].includes(event.type)
    ) {
      throw new Error(`MSS event at index ${eventIndex} is invalid.`);
    }

    const isBullish = event.type === "bullish";
    for (let index = event.index - 1; index >= 0; index -= 1) {
      const candle = bars[index];
      const isOppositeCandle = isBullish
        ? candle.close < candle.open
        : candle.close > candle.open;
      if (isOppositeCandle) {
        return [{
          index,
          confirmedAt: event.confirmedAt ?? event.index,
          type: event.type,
          top: candle.high,
          bottom: candle.low,
        }];
      }
    }

    return [];
  });
}