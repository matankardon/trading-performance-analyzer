import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../supabaseClient";
import NewsFeed from "./NewsFeed";

vi.mock("../supabaseClient", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const newsItem = {
  id: "headline-1",
  title: "Example company reports quarterly results",
  summary: "The company reported results for the quarter.",
  publisher: "Example News",
  published_at: "2026-10-12T12:00:00.000Z",
  url: "https://example.com/news",
  tickers: ["EXM"],
};

const explanation = {
  whatHappened: "The supplied headline reports quarterly results.",
  whyItMatters: "Results can inform views of the business, but the headline has limited detail.",
  affects: [{ market: "EXM", effect: "unclear", reasoning: "The summary does not establish a directional effect." }],
  watchNext: ["Review the full source report."],
  caveat: "The headline and summary provide limited information; reactions are not guaranteed.",
};

describe("NewsFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.functions.invoke.mockImplementation(async (name) => {
      if (name === "news") {
        return { data: { ok: true, items: [newsItem], providers: ["Massive"], before: null, refreshedAt: "2026-10-12T12:05:00Z" }, error: null };
      }
      return { data: { ok: true, explanation }, error: null };
    });
  });

  it("loads sourced headlines and fetches a cached explanation only when expanded", async () => {
    const onAskCoach = vi.fn();
    render(<NewsFeed scope="markets" onAskCoach={onAskCoach} />);
    expect(await screen.findByText(newsItem.title)).toBeInTheDocument();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("news", {
      body: { category: "all", tickers: [], limit: 20 },
    });
    fireEvent.click(screen.getByRole("button", { name: /Example company reports quarterly results/ }));
    expect(await screen.findByText(explanation.whatHappened)).toBeInTheDocument();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("news-explain", { body: { newsId: "headline-1" } });
    expect(screen.getByRole("link", { name: "Read at Example News ↗" })).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Ask coach about this" }));
    expect(onAskCoach).toHaveBeenCalledWith(expect.stringContaining(newsItem.title));
    expect(onAskCoach).toHaveBeenCalledWith(expect.stringContaining("EXM"));
    expect(screen.getByText("News via Massive.")).toBeInTheDocument();
  });

  it("defaults Investing scope to equities and updates on a category filter", async () => {
    render(<NewsFeed scope="investing" />);
    expect(await screen.findByText(newsItem.title)).toBeInTheDocument();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("news", {
      body: { category: "equities", tickers: [], limit: 20 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crypto" }));
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenLastCalledWith("news", {
      body: { category: "crypto", tickers: [], limit: 20 },
    }));
  });

  it("loads another page from the before cursor and appends it", async () => {
    supabase.functions.invoke.mockImplementation(async (name, { body }) => {
      if (name === "news" && body.before) {
        return {
          data: { ok: true, items: [{ ...newsItem, id: "headline-2", title: "Second report" }], providers: ["Massive"], before: null },
          error: null,
        };
      }
      if (name === "news") {
        return {
          data: { ok: true, items: [newsItem], providers: ["Massive"], before: "2026-10-12T12:00:00Z" },
          error: null,
        };
      }
      return { data: { ok: true, explanation }, error: null };
    });
    render(<NewsFeed />);
    expect(await screen.findByText(newsItem.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second report")).toBeInTheDocument();
    expect(supabase.functions.invoke).toHaveBeenLastCalledWith("news", {
      body: { category: "all", tickers: [], limit: 20, before: "2026-10-12T12:00:00Z" },
    });
  });

  it("keeps cached headlines visible and labels them when the provider refresh fails", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        items: [newsItem],
        providers: ["Massive"],
        before: null,
        stale: true,
        warning: { code: "NEWS_UNAVAILABLE", message: "Provider unavailable; showing cached results." },
      },
      error: null,
    });
    render(<NewsFeed />);
    expect(await screen.findByText(newsItem.title)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Provider unavailable; showing cached results. Showing cached headlines.");
  });

  it("shows an explanation rate-limit message and allows retry", async () => {
    supabase.functions.invoke.mockImplementation(async (name) => (
      name === "news"
        ? { data: { ok: true, items: [newsItem], providers: ["Massive"], before: null }, error: null }
        : { data: { ok: false, code: "RATE_LIMITED", message: "Explanation rate limit reached." }, error: null }
    ));
    render(<NewsFeed />);
    expect(await screen.findByText(newsItem.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Example company reports quarterly results/ }));
    expect(await screen.findByText("Explanation limit reached for now. Please try again later.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry explanation" })).toBeInTheDocument();
  });

  it("uses the TradingView headlines-only fallback when the news provider is unavailable", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { ok: false, code: "NEWS_UNAVAILABLE", message: "The configured news provider is unavailable." },
      error: null,
    });
    render(<NewsFeed />);
    expect(await screen.findByRole("alert")).toHaveTextContent("configured news provider is unavailable");
    expect(screen.getByText("TradingView fallback — headlines only; no AI explanation is available for these items.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Market news by TradingView" })).toBeVisible();
  });
});
