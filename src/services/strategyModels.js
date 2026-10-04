export const strategyConditionCatalog = [
  { key: "liquiditySweep", label: "Liquidity Sweep" },
  { key: "mss", label: "MSS" },
  { key: "fvg", label: "FVG" },
  { key: "displacement", label: "Displacement" },
  { key: "orderBlock", label: "Order Block" },
  { key: "stochasticConfirmation", label: "Stochastic Confirmation" },
  { key: "smaConfirmation", label: "SMA" },
  { key: "emaConfirmation", label: "EMA" },
  { key: "rsiConfirmation", label: "RSI" },
  { key: "macdConfirmation", label: "MACD" },
  { key: "bollingerConfirmation", label: "Bollinger Bands" },
  { key: "adxConfirmation", label: "ADX" },
  { key: "fibonacciConfirmation", label: "Fibonacci Levels" },
  { key: "ichimokuConfirmation", label: "Ichimoku" },
  { key: "stdDevConfirmation", label: "Standard Deviation" },
];

export const indicatorConditionCatalog = [
  { key: "smaConfirmation", label: "SMA", help: "Simple moving average of closing prices; configure the period and whether price should be above or below it.", parameters: [{ key: "period", label: "Period", defaultValue: 20, type: "number", min: 1 }, { key: "priceRelation", label: "Price relation", defaultValue: "above", type: "select", options: ["above", "below"] }] },
  { key: "emaConfirmation", label: "EMA", help: "Exponentially weighted moving average; a longer period responds more slowly to recent price changes.", parameters: [{ key: "period", label: "Period", defaultValue: 20, type: "number", min: 1 }, { key: "priceRelation", label: "Price relation", defaultValue: "above", type: "select", options: ["above", "below"] }] },
  { key: "rsiConfirmation", label: "RSI", help: "Momentum oscillator; configure its period and oversold/overbought boundaries.", parameters: [{ key: "period", label: "Period", defaultValue: 14, type: "number", min: 1 }, { key: "oversold", label: "Oversold", defaultValue: 30, type: "number", min: 0 }, { key: "overbought", label: "Overbought", defaultValue: 70, type: "number", min: 0 }] },
  { key: "macdConfirmation", label: "MACD", help: "Difference between fast and slow EMAs with a signal EMA; configure the periods and crossover direction.", parameters: [{ key: "fastPeriod", label: "Fast period", defaultValue: 12, type: "number", min: 1 }, { key: "slowPeriod", label: "Slow period", defaultValue: 26, type: "number", min: 2 }, { key: "signalPeriod", label: "Signal period", defaultValue: 9, type: "number", min: 1 }, { key: "crossover", label: "Crossover", defaultValue: "bullish", type: "select", options: ["bullish", "bearish"] }] },
  { key: "bollingerConfirmation", label: "Bollinger Bands", help: "Rolling mean with standard-deviation bands; the multiplier controls band width.", parameters: [{ key: "period", label: "Period", defaultValue: 20, type: "number", min: 1 }, { key: "stdDevMultiplier", label: "Deviation multiplier", defaultValue: 2, type: "number", min: 0, step: 0.1 }] },
  { key: "adxConfirmation", label: "ADX", help: "Wilder trend-strength measure; configure the smoothing period and minimum strength level.", parameters: [{ key: "period", label: "Period", defaultValue: 14, type: "number", min: 1 }, { key: "threshold", label: "Strength threshold", defaultValue: 25, type: "number", min: 0 }] },
  { key: "fibonacciConfirmation", label: "Fibonacci Levels", help: "Retracement levels from the rolling swing range; lookback controls the range window.", parameters: [{ key: "lookback", label: "Lookback", defaultValue: 50, type: "number", min: 1 }] },
  { key: "ichimokuConfirmation", label: "Ichimoku", help: "Midpoint-based trend and cloud lines; each period controls its high/low window.", parameters: [{ key: "conversionPeriod", label: "Conversion", defaultValue: 9, type: "number", min: 1 }, { key: "basePeriod", label: "Base", defaultValue: 26, type: "number", min: 1 }, { key: "spanBPeriod", label: "Span B", defaultValue: 52, type: "number", min: 1 }] },
  { key: "stdDevConfirmation", label: "Standard Deviation", help: "Rolling close-price dispersion; a longer period smooths measured volatility.", parameters: [{ key: "period", label: "Period", defaultValue: 20, type: "number", min: 1 }] },
  { key: "stochasticConfirmation", label: "Stochastic", help: "Existing %K/%D oscillator; periods change its range and smoothing. Oversold/overbought thresholds configure the strategy for future indicator wiring.", parameters: [{ key: "kPeriod", label: "K period", defaultValue: 14, type: "number", min: 1 }, { key: "dPeriod", label: "D period", defaultValue: 3, type: "number", min: 1 }, { key: "oversold", label: "Oversold", defaultValue: 20, type: "number", min: 0 }, { key: "overbought", label: "Overbought", defaultValue: 80, type: "number", min: 0 }] },
];

function createIndicatorSettings() {
  return Object.fromEntries(indicatorConditionCatalog.map(({ key, parameters }) => [
    key,
    Object.fromEntries(parameters.map(({ key: parameter, defaultValue }) => [parameter, defaultValue])),
  ]));
}

export const strategyStatuses = ["Draft", "Testing", "Validated", "Live", "Archived"];

export function createStrategyDraft(overrides = {}) {
  const defaultConditions = {
    ...strategyConditionCatalog.reduce((result, condition) => ({ ...result, [condition.key]: false }), {}),
    indicatorSettings: createIndicatorSettings(),
  };
  const conditions = {
    ...defaultConditions,
    ...(overrides.conditions || {}),
    indicatorSettings: {
      ...defaultConditions.indicatorSettings,
      ...(overrides.conditions?.indicatorSettings || {}),
    },
  };

  return {
    name: "",
    description: "",
    assets: "",
    timeframe: "",
    session: "",
    entryRules: "",
    exitRules: "",
    stopLossRules: "",
    takeProfitRules: "",
    riskReward: "",
    direction: "",
    status: "Draft",
    notes: "",
    ...overrides,
    conditions,
  };
}

export function createStrategyVersion(strategy, versionNumber = 1) {
  return {
    id: `${strategy.name || "strategy"}-v${versionNumber}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    version: versionNumber,
    createdAt: new Date().toISOString(),
    ...strategy,
  };
}

export function createBacktestRequest() {
  return {
    strategyId: "",
    versionId: "",
    asset: "",
    timeframe: "",
    startDate: "",
    endDate: "",
    session: "",
    riskPerTrade: "",
    riskMode: "percent",
    startingBalance: "",
    stopLossPct: "2",
    riskRewardRatio: "2",
    commissionPerTrade: "1",
    slippagePct: "0.05",
    swingSize: "2",
    sweepDetectionLookback: "5",
    sweepLookback: "10",
    setupLookback: "20",
    stochasticKPeriod: "14",
    stochasticDPeriod: "3",
  };
}
