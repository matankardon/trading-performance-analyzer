import { INDICATORS } from "../constants/strategyOptions";
import {
  calculateADX,
  calculateBollingerBands,
  calculateEMA,
  calculateIchimoku,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateStdDev,
} from "./indicators";
import { calculateStochastic } from "./stochastic";

function indicatorResult(indicator, bars) {
  const settings = indicator.settings;
  switch (indicator.name) {
    case "SMA": return { pane: "price", values: calculateSMA(bars, Number(settings.period) || 20) };
    case "EMA": return { pane: "price", values: calculateEMA(bars, Number(settings.period) || 20) };
    case "Bollinger": return { pane: "price", values: calculateBollingerBands(bars, Number(settings.period) || 20, Number(settings.stdDevMultiplier) || 2) };
    case "RSI": return { pane: "lower", values: calculateRSI(bars, Number(settings.period) || 14) };
    case "MACD": return { pane: "lower", values: calculateMACD(bars, Number(settings.fastPeriod) || 12, Number(settings.slowPeriod) || 26, Number(settings.signalPeriod) || 9) };
    case "ADX": return { pane: "lower", values: calculateADX(bars, Number(settings.period) || 14) };
    case "Ichimoku": return { pane: "price", values: calculateIchimoku(bars, Number(settings.conversionPeriod) || 9, Number(settings.basePeriod) || 26, Number(settings.spanBPeriod) || 52) };
    case "StdDev": return { pane: "lower", values: calculateStdDev(bars, Number(settings.period) || 20) };
    case "Stochastic": return { pane: "lower", values: calculateStochastic(bars, Number(settings.kPeriod) || 14, Number(settings.dPeriod) || 3) };
    default: return null;
  }
}

export function tradeIndicatorComputations(version, bars) {
  if (!version || !bars.length) return [];
  const conditions = version.conditions || {};
  const settings = conditions.indicatorSettings || {};
  return INDICATORS.filter(({ key }) => conditions[key]).map((item) => {
    const indicator = { ...item, settings: settings[item.key] || {} };
    try {
      return { item: indicator, output: indicatorResult(indicator, bars), error: "" };
    } catch (error) {
      return {
        item: indicator,
        output: null,
        error: error instanceof Error ? error.message : "Indicator configuration is invalid.",
      };
    }
  });
}
