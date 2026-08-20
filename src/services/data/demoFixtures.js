import { DATA_STATUS } from "./dataStatus";

export const demoDataMetadata = Object.freeze({
  source: "Local fixture",
  dataStatus: DATA_STATUS.SIMULATED,
});

export const demoEconomicEvents = Object.freeze([
  { id: 1, date: "2026-08-14", time: "15:30", currency: "USD", country: "United States", event: "Retail Sales", impact: "High", forecast: "0.5%", previous: "0.6%", action: "Avoid trading immediately before the release." },
  { id: 2, date: "2026-08-14", time: "15:30", currency: "USD", country: "United States", event: "Initial Jobless Claims", impact: "Medium", forecast: "225K", previous: "227K", action: "Watch volatility around the release." },
  { id: 3, date: "2026-08-14", time: "17:00", currency: "USD", country: "United States", event: "Consumer Sentiment", impact: "Medium", forecast: "62.0", previous: "61.8", action: "Wait for the first reaction before entering." },
  { id: 4, date: "2026-08-15", time: "10:00", currency: "EUR", country: "Euro Area", event: "GDP", impact: "High", forecast: "0.3%", previous: "0.2%", action: "Avoid aggressive entries before the release." },
  { id: 5, date: "2026-08-15", time: "11:00", currency: "GBP", country: "United Kingdom", event: "CPI", impact: "High", forecast: "3.7%", previous: "3.8%", action: "Expect increased volatility in GBP pairs." },
]);

export const demoExpertOpinions = Object.freeze([
  { id: 1, source: "CNBC", analyst: "Jim Cramer", publicationDate: "2026-08-18", publicationTime: "09:30", asset: "Gold (XAUUSD)", bias: "Bullish", reasoning: "Fed signals potential rate cuts amid economic slowdown concerns. Gold typically benefits from lower rates and increased safe-haven demand.", sourceLink: "https://www.cnbc.com/", sourceType: "Cable News / Market Commentary" },
  { id: 2, source: "Goldman Sachs Economics Research", analyst: "David Kostin", publicationDate: "2026-08-17", publicationTime: "14:00", asset: "S&P 500 (SPX)", bias: "Neutral", reasoning: "Current valuation reflects competing factors: strong earnings growth offset by elevated rate environment. Recommend wait-and-see approach pending inflation data.", sourceLink: "https://www.goldmansachs.com/", sourceType: "Institutional Research" },
  { id: 3, source: "European Central Bank", analyst: "Isabel Schnabel (Member)", publicationDate: "2026-08-16", publicationTime: "10:15", asset: "EUR/USD", bias: "Bearish", reasoning: "Recent remarks suggest ECB data-dependent approach. Expected Q3 GDP weakness supports lower near-term EUR outlook.", sourceLink: "https://www.ecb.europa.eu/", sourceType: "Official Central Bank" },
  { id: 4, source: "Oil Market Intelligence", analyst: "Amrita Sen", publicationDate: "2026-08-18", publicationTime: "07:45", asset: "Crude Oil (CL)", bias: "Bullish", reasoning: "Supply disruption in Middle East combined with expected demand recovery post-seasonal. OPEC production cuts supporting prices.", sourceLink: "https://www.energyintel.com/", sourceType: "Commodity Research" },
  { id: 5, source: "FX Street", analyst: "Editorial Desk", publicationDate: "2026-08-18", publicationTime: "06:20", asset: "GBP/USD", bias: "Neutral", reasoning: "BoE rate decision coming next week. Market awaiting clarity on inflation trajectory. Technical levels 1.2700-1.2900 acting as key resistance.", sourceLink: "https://www.fxstreet.com/", sourceType: "Financial News & Analysis" },
]);

export const demoSentimentRows = Object.freeze([
  ["Gold (XAUUSD)", "Bullish", "News and expert views"],
  ["S&P 500 (SPX)", "Neutral", "Valuation and rate context"],
  ["EUR/USD", "Bearish", "Central-bank commentary"],
  ["Crude Oil (CL)", "Bullish", "Commodity research"],
  ["GBP/USD", "Neutral", "Editorial market context"],
]);
