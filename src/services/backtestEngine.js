// This engine deliberately provides only a simple SMA crossover entry rule.
// Detecting MSS, FVG, order blocks, and liquidity sweeps from OHLC data is a
// separate future task and must not be implied by the strategy checkboxes.

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function getSma(closes, index, period) {
  if (index < period - 1) return null;
  return average(closes.slice(index - period + 1, index + 1));
}

function validatePercentage(value, name) {
  if (!isFiniteNumber(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
}

function validateBars(bars) {
  if (!Array.isArray(bars) || bars.length === 0) {
    throw new Error("bars must contain at least one historical bar.");
  }

  bars.forEach((bar, index) => {
    if (!bar || !["open", "high", "low", "close"].every((field) => isFiniteNumber(bar[field]))) {
      throw new Error(`bar at index ${index} must contain numeric open, high, low, and close values.`);
    }
  });
}

function calculateExit(position, bar) {
  const stopTouched = position.direction === "long"
    ? bar.low <= position.stopLoss
    : bar.high >= position.stopLoss;
  const targetTouched = position.direction === "long"
    ? bar.high >= position.takeProfit
    : bar.low <= position.takeProfit;

  // OHLC bars cannot reveal which level was touched first. Favoring the stop
  // avoids turning ambiguous intrabar movement into an optimistic result.
  if (stopTouched) return { price: position.stopLoss, reason: "stop_loss" };
  if (targetTouched) return { price: position.takeProfit, reason: "take_profit" };
  return null;
}

function closePosition(position, price, timestamp, reason) {
  const priceMove = position.direction === "long"
    ? price - position.entryPrice
    : position.entryPrice - price;
  const pnl = priceMove * position.positionSize;

  return {
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice: price,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    positionSize: position.positionSize,
    pnl,
    entryTimestamp: position.entryTimestamp,
    exitTimestamp: timestamp,
    exitReason: reason,
  };
}

function buildMetrics(trades, equityCurve) {
  const winningTrades = trades.filter((trade) => trade.pnl > 0);
  const grossProfit = winningTrades.reduce((total, trade) => total + trade.pnl, 0);
  const grossLoss = trades
    .filter((trade) => trade.pnl < 0)
    .reduce((total, trade) => total + Math.abs(trade.pnl), 0);
  let peak = equityCurve[0]?.equity ?? 0;
  let maxDrawdown = 0;

  equityCurve.forEach(({ equity }) => {
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  });

  const netPnl = trades.reduce((total, trade) => total + trade.pnl, 0);
  return {
    netPnl,
    winRate: trades.length ? (winningTrades.length / trades.length) * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
    expectancy: trades.length ? netPnl / trades.length : 0,
    maxDrawdown,
    totalTrades: trades.length,
  };
}

/**
 * Placeholder entry rule for this engine stage.
 * A crossover signal is evaluated on a completed bar and executed at the
 * following bar's open, so the rule cannot use future prices.
 */
export function smaCrossover(fastPeriod = 5, slowPeriod = 20) {
  if (!Number.isInteger(fastPeriod) || !Number.isInteger(slowPeriod) || fastPeriod < 1 || fastPeriod >= slowPeriod) {
    throw new Error("fastPeriod and slowPeriod must be positive integers, with fastPeriod smaller than slowPeriod.");
  }

  return ({ bars, index, direction = "long" }) => {
    if (index < slowPeriod || index < 1) return false;
    const closes = bars.map((bar) => bar.close);
    const previousFast = getSma(closes, index - 1, fastPeriod);
    const previousSlow = getSma(closes, index - 1, slowPeriod);
    const currentFast = getSma(closes, index, fastPeriod);
    const currentSlow = getSma(closes, index, slowPeriod);

    if ([previousFast, previousSlow, currentFast, currentSlow].some((value) => value === null)) return false;
    if (direction === "short") return previousFast >= previousSlow && currentFast < currentSlow;
    if (direction === "both") {
      return previousFast !== currentFast && (previousFast - previousSlow) * (currentFast - currentSlow) <= 0;
    }
    return previousFast <= previousSlow && currentFast > currentSlow;
  };
}

export function runBacktest({
  bars,
  entryRule,
  stopLossPct,
  takeProfitPct,
  riskPerTrade,
  startingBalance,
  direction = "long",
}) {
  validateBars(bars);
  validatePercentage(stopLossPct, "stopLossPct");
  validatePercentage(takeProfitPct, "takeProfitPct");
  validatePercentage(riskPerTrade, "riskPerTrade");
  if (!isFiniteNumber(startingBalance) || startingBalance <= 0) {
    throw new Error("startingBalance must be greater than zero.");
  }
  if (typeof entryRule !== "function") {
    throw new Error("entryRule must be a function.");
  }
  if (!["long", "short", "both"].includes(direction)) {
    throw new Error("direction must be long, short, or both.");
  }
  if (stopLossPct === 0 || takeProfitPct === 0) {
    throw new Error("stopLossPct and takeProfitPct must be greater than zero.");
  }

  const trades = [];
  const equityCurve = [{ timestamp: bars[0].timestamp, equity: startingBalance }];
  const riskCapital = startingBalance * riskPerTrade;
  let balance = startingBalance;
  let position = null;
  let pendingDirection = null;

  bars.forEach((bar, index) => {
    if (pendingDirection && !position) {
      const entryPrice = bar.open;
      const isLong = pendingDirection === "long";
      const stopLoss = isLong ? entryPrice * (1 - stopLossPct) : entryPrice * (1 + stopLossPct);
      const takeProfit = isLong ? entryPrice * (1 + takeProfitPct) : entryPrice * (1 - takeProfitPct);
      const stopDistance = Math.abs(entryPrice - stopLoss);
      position = {
        direction: pendingDirection,
        entryPrice,
        stopLoss,
        takeProfit,
        positionSize: riskCapital / stopDistance,
        entryTimestamp: bar.timestamp,
      };
      pendingDirection = null;
    }

    if (position) {
      const exit = calculateExit(position, bar);
      if (exit) {
        const trade = closePosition(position, exit.price, bar.timestamp, exit.reason);
        trades.push(trade);
        balance += trade.pnl;
        position = null;
      }
    }

    if (!position && index < bars.length - 1) {
      let signalDirection = direction;
      let shouldEnter = false;
      if (direction === "both") {
        shouldEnter = entryRule({ bars, index, direction: "long" });
        signalDirection = shouldEnter ? "long" : "short";
        if (!shouldEnter) shouldEnter = entryRule({ bars, index, direction: "short" });
      } else {
        shouldEnter = entryRule({ bars, index, direction });
      }
      if (shouldEnter) {
        pendingDirection = signalDirection;
      }
    }

    const markedPnl = position
      ? (position.direction === "long" ? bar.close - position.entryPrice : position.entryPrice - bar.close) * position.positionSize
      : 0;
    equityCurve.push({ timestamp: bar.timestamp, equity: balance + markedPnl });
  });

  if (position) {
    const lastBar = bars[bars.length - 1];
    const trade = closePosition(position, lastBar.close, lastBar.timestamp, "end_of_data");
    trades.push(trade);
    balance += trade.pnl;
    equityCurve[equityCurve.length - 1].equity = balance;
  }

  return {
    trades,
    equityCurve,
    ...buildMetrics(trades, equityCurve),
  };
}