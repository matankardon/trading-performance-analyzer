import { categorizeNews } from "./category.ts";
import type { MassiveNewsArticle, NormalizedNewsItem } from "./types.ts";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    const ticker = typeof entry === "string" ? entry.trim().toUpperCase() : "";
    return /^[A-Z0-9.-]{1,15}$/.test(ticker) ? [ticker] : [];
  }))].slice(0, 30);
}

export function normalizeMassiveArticle(value: unknown): NormalizedNewsItem | null {
  const article = record(value);
  if (!article) return null;
  const title = cleanText(article.title, 300);
  const providerItemId = cleanText(article.id, 200);
  const url = cleanText(article.article_url, 2048);
  const publisher = record(article.publisher);
  const publisherName = cleanText(publisher?.name, 160);
  const publishedAt = typeof article.published_utc === "string" ? article.published_utc : "";
  const timestamp = Date.parse(publishedAt);

  if (!title || !providerItemId || !url.startsWith("https://") || !publisherName || !Number.isFinite(timestamp)) {
    return null;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (parsedUrl.username || parsedUrl.password) return null;

  const summary = cleanText(article.description, 1200) || null;
  const tickers = getStrings(article.tickers);
  return {
    provider: "massive",
    providerItemId,
    title,
    summary,
    url: parsedUrl.toString(),
    publisher: publisherName,
    publishedAt: new Date(timestamp).toISOString(),
    tickers,
    category: categorizeNews(title, summary),
  };
}

export function normalizeMassiveResponse(payload: unknown): NormalizedNewsItem[] {
  const root = record(payload);
  if (!root || !Array.isArray(root.results)) return [];
  return root.results.flatMap((article: MassiveNewsArticle | unknown) => {
    const normalized = normalizeMassiveArticle(article);
    return normalized ? [normalized] : [];
  });
}
