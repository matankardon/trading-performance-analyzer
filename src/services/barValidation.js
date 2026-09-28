export function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length === 0) {
    throw new Error("Historical bars must be a non-empty array.");
  }

  let previousTimestamp = null;
  bars.forEach((bar, index) => {
    if (!bar || !Number.isFinite(bar.timestamp)) {
      throw new Error(`Bar ${index} must have a finite timestamp.`);
    }
    if (previousTimestamp !== null && bar.timestamp <= previousTimestamp) {
      throw new Error(`Bar ${index} timestamp must be greater than the previous bar timestamp.`);
    }

    const prices = [bar.open, bar.high, bar.low, bar.close];
    if (!prices.every((price) => Number.isFinite(price) && price > 0)) {
      throw new Error(`Bar ${index} must have finite positive open, high, low, and close values.`);
    }
    if (bar.high < Math.max(bar.open, bar.close, bar.low)) {
      throw new Error(`Bar ${index} high must be at least its open, close, and low.`);
    }
    if (bar.low > Math.min(bar.open, bar.close, bar.high)) {
      throw new Error(`Bar ${index} low must be at most its open, close, and high.`);
    }
    if (!Number.isFinite(bar.volume) || bar.volume < 0) {
      throw new Error(`Bar ${index} volume must be a finite non-negative number.`);
    }

    previousTimestamp = bar.timestamp;
  });

  return true;
}