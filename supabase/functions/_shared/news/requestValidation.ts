import { isNewsCategory } from "./category.ts";
import type { NewsExplanation, NewsListingRequest } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateNewsListingRequest(value: unknown): NewsListingRequest | null {
  if (!isRecord(value)) return null;
  const allowed = ["category", "tickers", "limit", "before"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return null;
  if (!isNewsCategory(value.category)) return null;

  const rawTickers = value.tickers === undefined ? [] : value.tickers;
  if (
    !Array.isArray(rawTickers) || rawTickers.length > 10 ||
    rawTickers.some((ticker) =>
      typeof ticker !== "string" || !/^[A-Za-z0-9.-]{1,15}$/.test(ticker.trim())
    )
  ) return null;
  const tickers = [...new Set(rawTickers.map((ticker) => ticker.trim().toUpperCase()))];

  const limit = value.limit === undefined ? 25 : value.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50) return null;

  let before: string | null = null;
  if (value.before !== undefined && value.before !== null) {
    if (typeof value.before !== "string" || !Number.isFinite(Date.parse(value.before))) return null;
    before = new Date(value.before).toISOString();
  }
  return { category: value.category, tickers, limit: limit as number, before };
}

export function validateNewsExplanationRequest(value: unknown): string | null {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "newsId")) return null;
  return typeof value.newsId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.newsId)
    ? value.newsId
    : null;
}

const TEXT_LIMITS = {
  whatHappened: 700,
  whyItMatters: 700,
  caveat: 500,
} as const;

export function validateNewsExplanation(value: unknown): NewsExplanation | null {
  if (!isRecord(value)) return null;
  const keys = ["whatHappened", "whyItMatters", "affects", "watchNext", "caveat"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) return null;

  for (const [field, maxLength] of Object.entries(TEXT_LIMITS)) {
    const text = value[field];
    if (typeof text !== "string" || !text.trim() || text.length > maxLength) return null;
  }

  if (!Array.isArray(value.affects) || value.affects.length > 4) return null;
  const affects = value.affects.map((entry): { market: string; effect: string; reasoning: string } | null => {
    if (!isRecord(entry) || Object.keys(entry).length !== 3) return null;
    const { market, effect, reasoning } = entry;
    if (
      typeof market !== "string" || !market.trim() || market.length > 80 ||
      typeof effect !== "string" || !effect.trim() || effect.length > 180 ||
      typeof reasoning !== "string" || !reasoning.trim() || reasoning.length > 300
    ) return null;
    return { market: market.trim(), effect: effect.trim(), reasoning: reasoning.trim() };
  });
  if (affects.some((entry) => entry === null)) return null;

  if (
    !Array.isArray(value.watchNext) || value.watchNext.length > 3 ||
    value.watchNext.some((entry) =>
      typeof entry !== "string" || !entry.trim() || entry.length > 180
    )
  ) return null;

  return {
    whatHappened: (value.whatHappened as string).trim(),
    whyItMatters: (value.whyItMatters as string).trim(),
    affects: affects as NonNullable<typeof affects[number]>[],
    watchNext: (value.watchNext as string[]).map((entry) => entry.trim()),
    caveat: (value.caveat as string).trim(),
  };
}
