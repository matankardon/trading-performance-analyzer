import { NEWS_CATEGORIES, NEWS_REQUEST_CATEGORIES, type NewsCategory } from "./types.ts";

const CATEGORY_TERMS: Record<Exclude<NewsCategory, "other">, RegExp> = {
  markets: /\b(markets?|trading|futures|bonds|indices|volatility)\b/i,
  forex: /\b(forex|foreign exchange|currency pair|exchange rates?|fx market)\b/i,
  crypto: /\b(crypto(?:currency)?|bitcoin|ethereum|blockchain|digital assets?)\b/i,
  equities: /\b(equities|stocks?|shares|earnings|quarterly results|revenue|eps|guidance)\b/i,
  macro: /\b(fed|fomc|interest rates?|inflation|cpi|nfp|payrolls|gdp|treasury|central bank|unemployment)\b/i,
};

export function isNewsCategory(value: unknown): value is typeof NEWS_REQUEST_CATEGORIES[number] {
  return typeof value === "string" &&
    NEWS_REQUEST_CATEGORIES.includes(value as typeof NEWS_REQUEST_CATEGORIES[number]);
}

export function categorizeNews(title: string, summary: string | null): NewsCategory {
  const text = `${title} ${summary ?? ""}`;
  if (CATEGORY_TERMS.crypto.test(text)) return "crypto";
  if (CATEGORY_TERMS.forex.test(text)) return "forex";
  if (CATEGORY_TERMS.macro.test(text)) return "macro";
  if (CATEGORY_TERMS.equities.test(text)) return "equities";
  if (CATEGORY_TERMS.markets.test(text)) return "markets";
  return "other";
}

export function matchesNewsCategory(category: NewsCategory, requested: string): boolean {
  return requested === "all" || requested === category;
}
