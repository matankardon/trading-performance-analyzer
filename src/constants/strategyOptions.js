export const SETUP_CONDITIONS = [
  { key: "liquiditySweep", label: "Liquidity Sweep" },
  { key: "mss", label: "MSS" },
  { key: "fvg", label: "FVG" },
  { key: "displacement", label: "Displacement" },
  { key: "orderBlock", label: "Order Block" },
  { key: "stochasticConfirmation", label: "Stochastic Confirmation" },
];

export const INDICATORS = [
  { key: "smaConfirmation", name: "SMA", label: "SMA" },
  { key: "emaConfirmation", name: "EMA", label: "EMA" },
  { key: "rsiConfirmation", name: "RSI", label: "RSI" },
  { key: "macdConfirmation", name: "MACD", label: "MACD" },
  { key: "bollingerConfirmation", name: "Bollinger", label: "Bollinger" },
  { key: "adxConfirmation", name: "ADX", label: "ADX" },
  { key: "fibonacciConfirmation", name: "Fibonacci", label: "Fibonacci" },
  { key: "ichimokuConfirmation", name: "Ichimoku", label: "Ichimoku" },
  { key: "stdDevConfirmation", name: "StdDev", label: "StdDev" },
];

export const INDICATOR_NAMES = INDICATORS.map(({ name }) => name);
