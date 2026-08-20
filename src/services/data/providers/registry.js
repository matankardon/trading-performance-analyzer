import { createUnavailableProvider } from "./unavailableProvider";

const providerSettings = {
  market: import.meta.env.VITE_MARKET_DATA_PROVIDER || "",
  news: import.meta.env.VITE_NEWS_PROVIDER || "",
  economic: import.meta.env.VITE_ECONOMIC_DATA_PROVIDER || "",
  sentiment: import.meta.env.VITE_SENTIMENT_PROVIDER || "",
};

const providerDomains = {
  market: "market data",
  news: "news",
  economic: "economic data",
  sentiment: "sentiment",
};

export const dataSourceRegistry = Object.freeze(Object.fromEntries(Object.entries(providerDomains).map(([key, domain]) => [key, {
  id: providerSettings[key] || null,
  domain,
  available: Boolean(providerSettings[key]),
  configured: Boolean(providerSettings[key]),
  status: providerSettings[key] ? "CONFIGURED" : "UNAVAILABLE",
  requiresCredentials: !providerSettings[key],
}])));

const providers = new Map();

export function registerDataProvider(domain, provider) {
  if (!provider || typeof provider !== "object") throw new Error(`Invalid ${domain} provider`);
  providers.set(domain, provider);
}

export function getDataProvider(domain) {
  return providers.get(domain) || createUnavailableProvider(providerDomains[domain] || domain);
}

export function getDataSourceRegistry() {
  return dataSourceRegistry;
}
