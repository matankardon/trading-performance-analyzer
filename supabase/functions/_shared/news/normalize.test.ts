import { describe, expect, it } from "vitest";
import { categorizeNews } from "./category.ts";
import { dedupeNews } from "./dedupe.ts";
import {
  getCachedNewsExplanation,
  postProcessNewsExplanation,
} from "./explanation.ts";
import { normalizeMassiveResponse } from "./normalize.ts";
import {
  validateNewsExplanation,
  validateNewsListingRequest,
  validateNewsExplanationRequest,
} from "./requestValidation.ts";
import { isNewsCacheStale, refreshWithStaleFallback } from "./refresh.ts";

describe("news helpers", () => {
  const article = {
    id: "news-1",
    title: "Fed signals interest rate decision",
    description: "The Federal Reserve discussed inflation and interest rates.",
    article_url: "https://news.example/article",
    published_utc: "2026-10-13T08:00:00Z",
    publisher: { name: "Example News" },
    tickers: ["spy", "bad ticker"],
  };

  const validExplanation = {
    whatHappened: "The Fed discussed interest rates.",
    whyItMatters: "The discussion may influence market expectations.",
    affects: [{
      market: "Equities",
      effect: "Sentiment may change.",
      reasoning: "The headline describes a rate discussion.",
    }],
    watchNext: ["Official Fed communications"],
    caveat: "The summary does not confirm a policy change.",
  };

  it("normalizes Massive's documented response fields and drops invalid rows", () => {
    const items = normalizeMassiveResponse({ results: [article, { ...article, id: "" }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      provider: "massive",
      providerItemId: "news-1",
      publisher: "Example News",
      category: "macro",
      tickers: ["SPY"],
    });
    expect(normalizeMassiveResponse({
      results: [{ ...article, publisher: { name: "" } }],
    })).toHaveLength(0);
  });

  it("deduplicates provider IDs and article URLs", () => {
    const items = normalizeMassiveResponse({
      results: [article, article, { ...article, id: "news-2" }],
    });
    expect(dedupeNews(items)).toHaveLength(1);
  });

  it("accepts all as a request filter without treating it as a stored category", () => {
    expect(validateNewsListingRequest({ category: "all" })).toMatchObject({ category: "all" });
    expect(validateNewsListingRequest({ category: "forex" })).toMatchObject({ category: "forex" });
    expect(validateNewsListingRequest({ category: "not-a-category" })).toBeNull();
    expect(categorizeNews("EUR/USD forex market update", null)).toBe("forex");
    expect(categorizeNews("Bitcoin and cryptocurrency update", null)).toBe("crypto");
    expect(categorizeNews("Untyped company announcement", null)).toBe("other");
  });

  it("validates listing and explanation request payloads", () => {
    expect(validateNewsListingRequest({ category: "equities", tickers: ["spy"], limit: 10, before: null }))
      .toMatchObject({ category: "equities", tickers: ["SPY"], limit: 10 });
    expect(validateNewsExplanationRequest({ newsId: "93fb19ad-7167-4fa5-a08e-024fa14efec2" }))
      .toBe("93fb19ad-7167-4fa5-a08e-024fa14efec2");
    expect(validateNewsExplanationRequest({ newsId: "not-a-uuid" })).toBeNull();
  });

  it("validates explanation schema and strict affects/watchNext limits", () => {
    expect(validateNewsExplanation(validExplanation)).toEqual(validExplanation);
    expect(validateNewsExplanation({
      ...validExplanation,
      affects: Array.from({ length: 5 }, () => validExplanation.affects[0]),
    })).toBeNull();
    expect(validateNewsExplanation({
      ...validExplanation,
      watchNext: ["a", "b", "c", "d"],
    })).toBeNull();
  });

  it("accepts strict JSON wrapped in a code fence", () => {
    expect(postProcessNewsExplanation(
      `\`\`\`json\n${JSON.stringify(validExplanation)}\n\`\`\``,
      article.title,
      article.description,
    )).toEqual(validExplanation);
  });

  it("rejects malformed and schema-invalid model output", () => {
    expect(postProcessNewsExplanation("{ malformed", article.title, article.description)).toBeNull();
    expect(postProcessNewsExplanation('```json\n{"whatHappened":"x"}\n```', article.title, article.description))
      .toBeNull();
  });

  it("rejects unsupported numeric claims and banned phrases", () => {
    expect(postProcessNewsExplanation(
      JSON.stringify({ ...validExplanation, whatHappened: "The Fed met in 2027." }),
      article.title,
      article.description,
    )).toBeNull();
    expect(postProcessNewsExplanation(
      JSON.stringify({ ...validExplanation, whyItMatters: "This is a guaranteed profit." }),
      article.title,
      article.description,
    )).toBeNull();
  });

  it("reuses only valid cached explanations", () => {
    expect(getCachedNewsExplanation(validExplanation)).toEqual(validExplanation);
    expect(getCachedNewsExplanation({ ...validExplanation, affects: ["invented shape"] })).toBeNull();
  });

  it("uses stale data on lock contention or refresh errors", async () => {
    expect(isNewsCacheStale("2026-10-13T08:59:00Z", Date.parse("2026-10-13T09:00:00Z"))).toBe(false);
    const cached = { items: ["cached"], hasMore: false };
    const busy = await refreshWithStaleFallback(cached, "2026-01-01T00:00:00Z", async () => false, async () => {
      throw new Error("unused");
    });
    expect(busy).toMatchObject({ status: "stale", refreshing: true, data: cached });
    const failed = await refreshWithStaleFallback(cached, null, async () => true, async () => {
      throw new Error("unused");
    });
    expect(failed).toMatchObject({ status: "stale", refreshFailed: true, data: cached });
  });
});
