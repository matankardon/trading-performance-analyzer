export const NEWS_CATEGORIES = [
  "markets",
  "forex",
  "crypto",
  "equities",
  "macro",
  "other",
] as const;

export const NEWS_REQUEST_CATEGORIES = ["all", ...NEWS_CATEGORIES] as const;

export type NewsCategory = typeof NEWS_CATEGORIES[number];
export type NewsRequestCategory = typeof NEWS_REQUEST_CATEGORIES[number];

export type NewsItem = {
  id: string;
  provider: string;
  title: string;
  summary: string | null;
  url: string;
  publisher: string;
  publishedAt: string;
  tickers: string[];
  category: NewsCategory;
};

export type NormalizedNewsItem = Omit<NewsItem, "id"> & {
  providerItemId: string;
};

export type MassiveNewsArticle = {
  id: string;
  title: string;
  article_url: string;
  published_utc: string;
  description?: string;
  publisher?: { name?: string };
  tickers?: string[];
};

export type MassiveNewsResponse = {
  results: MassiveNewsArticle[];
};

export type NewsListingRequest = {
  category: NewsRequestCategory;
  tickers: string[];
  limit: number;
  before: string | null;
};

export type NewsAffectedMarket = {
  market: string;
  effect: string;
  reasoning: string;
};

export type NewsExplanation = {
  whatHappened: string;
  whyItMatters: string;
  affects: NewsAffectedMarket[];
  watchNext: string[];
  caveat: string;
};
