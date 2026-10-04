import { validateBars } from "./barValidation";

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

function calculateExit(position, bar) {
  const openBeyondStop = position.direction === "long"
    ? bar.open <= position.stopLoss
    : bar.open >= position.stopLoss;
  const openBeyondTarget = position.direction === "long"
    ? bar.open >= position.takeProfit
    : bar.open <= position.takeProfit;
  if (openBeyondStop) return { price: bar.open, reason: "stop_loss" };
  if (openBeyondTarget) return { price: bar.open, reason: "take_profit" };

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

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return "unknown";
  if (durationMs < 1000) return `${durationMs}ms`;

  const totalSeconds = Math.floor(durationMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    seconds ? `${seconds}s` : "",
  ].filter(Boolean).join(" ");
}

function closePosition(position, price, timestamp, reason, exitIndex, commissionPerTrade, slippagePct) {
  const exitPrice = position.direction === "long"
    ? price * (1 - slippagePct)
    : price * (1 + slippagePct);
  const priceMove = position.direction === "long"
    ? exitPrice - position.entryPrice
    : position.entryPrice - exitPrice;
  const grossPnl = priceMove * position.positionSize;
  const pnl = grossPnl - commissionPerTrade;
  const calendarTimeHeldMs = Number.isFinite(position.entryTimestamp) && Number.isFinite(timestamp)
    ? timestamp - position.entryTimestamp
    : NaN;

  return {
    direction: position.direction,
    entryPrice: position.entryPrice,
    exitPrice,
    stopLoss: position.stopLoss,
    takeProfit: position.takeProfit,
    positionSize: position.positionSize,
    sizeCappedByEquity: Boolean(position.sizeCappedByEquity),
    pnl,
    grossPnl,
    commission: commissionPerTrade,
    entryIndex: position.entryIndex,
    exitIndex,
    barsHeld: exitIndex - position.entryIndex,
    entryTimestamp: position.entryTimestamp,
    exitTimestamp: timestamp,
    calendarTimeHeldMs,
    calendarTimeHeld: formatDuration(calendarTimeHeldMs),
    entryReasoning: position.entryReasoning || null,
    exitReason: reason,
  };
}

function getDailyEquityCloses(equityCurve) {
  const dailyCloses = new Map();
  equityCurve.forEach(({ timestamp, equity }) => {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      dailyCloses.set(date.toISOString().slice(0, 10), equity);
    }
  });
  return [...dailyCloses.values()];
}

function calculateSharpeRatio(equityCurve) {
  const dailyCloses = getDailyEquityCloses(equityCurve);
  if (dailyCloses.length < 30) return null;
  const returns = dailyCloses.slice(1).map((close, index) => close / dailyCloses[index] - 1);
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance = returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length;
  const standardDeviation = Math.sqrt(variance);
  return standardDeviation ? (mean / standardDeviation) * Math.sqrt(252) : null;
}

export function calculateExpandedMetrics(trades, equityCurve, startingBalance, totalBars) {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  let maxConsecutiveLosses = 0;
  let consecutiveLosses = 0;
  trades.forEach((trade) => {
    consecutiveLosses = trade.pnl < 0 ? consecutiveLosses + 1 : 0;
    maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
  });
  const averageWin = wins.length ? wins.reduce((total, trade) => total + trade.pnl, 0) / wins.length : 0;
  const averageLoss = losses.length ? losses.reduce((total, trade) => total + trade.pnl, 0) / losses.length : 0;
  const barsInPosition = trades.reduce((total, trade) => total + Math.max(0, trade.exitIndex - trade.entryIndex + 1), 0);

  return {
    returnPct: startingBalance ? (trades.reduce((total, trade) => total + trade.pnl, 0) / startingBalance) * 100 : 0,
    averageWin,
    averageLoss,
    winLossRatio: averageLoss ? averageWin / Math.abs(averageLoss) : null,
    maxConsecutiveLosses,
    largestWin: wins.length ? Math.max(...wins.map((trade) => trade.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((trade) => trade.pnl)) : 0,
    timeInMarketPct: totalBars ? (Math.min(barsInPosition, totalBars) / totalBars) * 100 : 0,
    sharpeRatio: calculateSharpeRatio(equityCurve),
  };
}

function buildMetrics(trades, equityCurve, startingBalance, totalBars) {
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
    ...calculateExpandedMetrics(trades, equityCurve, startingBalance, totalBars),
  };
}

function getSignalDirections(entryRule, bars, index, direction) {
  const directions = direction === "both" ? ["long", "short"] : [direction];
  return directions.filter((signalDirection) => entryRule({ bars, index, direction: signalDirection }));
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
  riskPerTrade = 0,
  riskCapital: requestedRiskCapital,
  startingBalance,
  direction = "long",
  debugSignals = false,
  commissionPerTrade = 0,
  slippagePct = 0,
}) {
  validateBars(bars);
  validatePercentage(stopLossPct, "stopLossPct");
  validatePercentage(takeProfitPct, "takeProfitPct");
  if (requestedRiskCapital === undefined) {
    validatePercentage(riskPerTrade, "riskPerTrade");
  } else if (!isFiniteNumber(requestedRiskCapital) || requestedRiskCapital <= 0) {
    throw new Error("riskCapital must be greater than zero.");
  }
  validatePercentage(slippagePct, "slippagePct");
  if (!isFiniteNumber(commissionPerTrade) || commissionPerTrade < 0) {
    throw new Error("commissionPerTrade must be a non-negative number.");
  }
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
  const equityCurve = [];
  const riskCapital = requestedRiskCapital ?? startingBalance * riskPerTrade;
  let balance = startingBalance;
  let position = null;
  let pendingDirection = null;
  let pendingEntryReasoning = null;
  let rawSignalCount = 0;
  let queuedSignalCount = 0;
  let skippedWhilePositionOpen = 0;
  let signalsWithoutNextBar = 0;

  bars.forEach((bar, index) => {
    if (pendingDirection && !position) {
      const entryPrice = pendingDirection === "long"
        ? bar.open * (1 + slippagePct)
        : bar.open * (1 - slippagePct);
      const isLong = pendingDirection === "long";
      const stopLoss = isLong ? entryPrice * (1 - stopLossPct) : entryPrice * (1 + stopLossPct);
      const takeProfit = isLong ? entryPrice * (1 + takeProfitPct) : entryPrice * (1 - takeProfitPct);
      const stopDistance = Math.abs(entryPrice - stopLoss);
      const rawPositionSize = riskCapital / stopDistance;
      const currentEquity = balance;
      const notionalValue = rawPositionSize * entryPrice;
      const sizeCappedByEquity = currentEquity > 0 && notionalValue > currentEquity;
      const cappedPositionSize = sizeCappedByEquity
        ? currentEquity / entryPrice
        : rawPositionSize;
      position = {
        direction: pendingDirection,
        entryPrice,
        stopLoss,
        takeProfit,
        positionSize: cappedPositionSize,
        sizeCappedByEquity,
        entryReasoning: pendingEntryReasoning,
        entryIndex: index,
        entryTimestamp: bar.timestamp,
      };
      pendingDirection = null;
    }

    if (position) {
      const exit = calculateExit(position, bar);
      if (exit) {
        const trade = closePosition(position, exit.price, bar.timestamp, exit.reason, index, commissionPerTrade, slippagePct);
        trades.push(trade);
        if (debugSignals) console.info("[backtest] recorded trade", trade);
        balance += trade.pnl;
        position = null;
      }
    }

    if (!position || debugSignals) {
      const canEnterOnNextBar = index < bars.length - 1;
      const signalDirections = canEnterOnNextBar || debugSignals
        ? getSignalDirections(entryRule, bars, index, direction)
        : [];

      if (debugSignals) rawSignalCount += signalDirections.length;

      if (position && signalDirections.length > 0) {
        if (debugSignals) {
          skippedWhilePositionOpen += signalDirections.length;
          signalDirections.forEach((signalDirection) => {
            console.info("[backtest] raw entry signal", {
              index,
              timestamp: bar.timestamp,
              direction: signalDirection,
              disposition: "ignored_position_open",
            });
          });
        }
      } else if (signalDirections.length > 0 && canEnterOnNextBar) {
        pendingDirection = signalDirections[0];
        pendingEntryReasoning = typeof entryRule.getEntryReasoning === "function"
          ? entryRule.getEntryReasoning(index, pendingDirection, index + 1)
          : null;
        if (debugSignals) {
          queuedSignalCount += 1;
          signalDirections.forEach((signalDirection, signalIndex) => {
            console.info("[backtest] raw entry signal", {
              index,
              timestamp: bar.timestamp,
              direction: signalDirection,
              disposition: signalIndex === 0 ? "queued_next_bar" : "direction_priority",
            });
          });
        }
      } else if (signalDirections.length > 0 && debugSignals) {
        signalsWithoutNextBar += signalDirections.length;
        signalDirections.forEach((signalDirection) => {
          console.info("[backtest] raw entry signal", {
            index,
            timestamp: bar.timestamp,
            direction: signalDirection,
            disposition: "no_next_bar",
          });
        });
      }
    }

    const markedPnl = position
      ? (position.direction === "long" ? bar.close - position.entryPrice : position.entryPrice - bar.close) * position.positionSize
      : 0;
    equityCurve.push({ timestamp: bar.timestamp, equity: balance + markedPnl });
  });

  if (position) {
    const lastBar = bars[bars.length - 1];
    const trade = closePosition(position, lastBar.close, lastBar.timestamp, "end_of_data", bars.length - 1, commissionPerTrade, slippagePct);
    trades.push(trade);
    if (debugSignals) console.info("[backtest] recorded trade", trade);
    balance += trade.pnl;
    equityCurve[equityCurve.length - 1].equity = balance;
  }

  if (debugSignals) {
    if (typeof entryRule.getDiagnostics === "function") {
      console.info("[backtest] condition funnel", entryRule.getDiagnostics(direction));
    }
    console.info("[backtest] signal diagnostics", {
      rawSignalCount,
      queuedSignalCount,
      skippedWhilePositionOpen,
      signalsWithoutNextBar,
      tradesRecorded: trades.length,
    });
  }

  const sizeCappedTradeCount = trades.filter((trade) => trade.sizeCappedByEquity).length;

  return {
    trades,
    equityCurve,
    sizeCappedTradeCount,
    ...buildMetrics(trades, equityCurve, startingBalance, bars.length),
  };
}