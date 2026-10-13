import { dedupeNews } from "./dedupe.ts";
import { normalizeMassiveResponse } from "./normalize.ts";
import type { NormalizedNewsItem } from "./types.ts";

const MASSIVE_NEWS_ENDPOINT = "https://api.massive.com/v2/reference/news";

export async function fetchMassiveNews(
  tickers: string[] = [],
  signal?: AbortSignal,
): Promise<NormalizedNewsItem[]> {
  const apiKey = Deno.env.get("MASSIVE_API_KEY");
  if (!apiKey) throw new Error("NEWS_PROVIDER_NOT_CONFIGURED");

  const url = new URL(MASSIVE_NEWS_ENDPOINT);
  if (tickers.length > 0) url.searchParams.set("ticker", tickers.join(","));
  url.searchParams.set("published_utc.gte", new Date(Date.now() - 7 * 86400000).toISOString());
  url.searchParams.set("sort", "published_utc");
  url.searchParams.set("order", "desc");
  url.searchParams.set("limit", "50");
  url.searchParams.set("apiKey", apiKey);

  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("NEWS_PROVIDER_UNAVAILABLE");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("NEWS_PROVIDER_INVALID_RESPONSE");
  }
  return dedupeNews(normalizeMassiveResponse(payload));
}
