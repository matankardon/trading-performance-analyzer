export const MARKET_SCORE_EXPLANATIONS = Object.freeze({
  trend: {
    heading: "Trend",
    text: "Compares EMA20, EMA50, and EMA200 alignment with the EMA50 slope normalized by ATR. Higher quality reflects clearer alignment and slope; crossed or closely grouped averages can lower it. Moving averages summarize past bars and may lag or conflict.",
  },
  structure: {
    heading: "Structure",
    text: "Compares recent confirmed swing highs and lows. Consistent higher highs and lows or lower highs and lows indicate clearer structure; mixed pivots lower clarity. Swings depend on the selected bar interval and do not establish future direction.",
  },
  momentum: {
    heading: "Momentum",
    text: "Combines RSI14 with the MACD histogram sign. Agreement at non-extreme RSI levels can support a higher environment-quality reading; disagreement or stretched RSI can lower it. Momentum measures recent movement and can change quickly.",
  },
  volatility: {
    heading: "Volatility",
    text: "Compares ATR14 as a percentage of price with its trailing 100-bar percentile. A middle-range reading is preferred over unusually quiet or elevated movement. This relative measure is based on the available historical window.",
  },
  volume: {
    heading: "Volume",
    text: "Compares average volume over the latest five bars with the trailing 50-bar average. Missing or zero volume is excluded from the weighted score. Provider volume may represent a different measure across asset classes.",
  },
});
