import { useCallback, useEffect, useMemo, useState } from "react";
import { NEWS_CATEGORIES, loadNews, loadNewsExplanation } from "../services/newsFeed";
import { buildTimelineConfig } from "../services/tradingViewWidgetConfigs";
import TradingViewWidget from "./TradingViewWidget";
import "./TradingViewWidgets.css";

function itemValue(item, snakeCase, camelCase) {
  return item?.[snakeCase] ?? item?.[camelCase];
}

function relativeTime(value) {
  if (!value) return "Time unavailable";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.round((timestamp - Date.now()) / 60_000);
  const absolute = Math.abs(minutes);
  if (absolute < 60) return `${absolute}m ${minutes <= 0 ? "ago" : "from now"}`;
  const hours = Math.round(absolute / 60);
  if (hours < 24) return `${hours}h ${minutes <= 0 ? "ago" : "from now"}`;
  const days = Math.round(hours / 24);
  return `${days}d ${minutes <= 0 ? "ago" : "from now"}`;
}

function safeArticleUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function Explanation({ explanation }) {
  return (
    <div className="news-explanation-content">
      <section><h4>What happened</h4><p>{explanation.whatHappened}</p></section>
      <section><h4>Why it matters</h4><p>{explanation.whyItMatters}</p></section>
      <section>
        <h4>How it may affect</h4>
        {explanation.affects?.length
          ? <ul>{explanation.affects.map((effect, index) => (
            <li key={`${effect.market}-${index}`}>
              <strong>{effect.market} · {effect.effect}</strong> — {effect.reasoning}
            </li>
          ))}</ul>
          : <p>No specific market effects could be supported by the available headline context.</p>}
      </section>
      <section>
        <h4>What to watch</h4>
        {explanation.watchNext?.length
          ? <ul>{explanation.watchNext.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p>No follow-up item was supported by the available information.</p>}
      </section>
      <p className="news-explanation-caveat">{explanation.caveat}</p>
    </div>
  );
}

function NewsFeed({ scope = "markets", tickers = [], onAskCoach }) {
  const [category, setCategory] = useState(scope === "investing" ? "equities" : "all");
  const [items, setItems] = useState([]);
  const [providers, setProviders] = useState([]);
  const [refreshedAt, setRefreshedAt] = useState("");
  const [before, setBefore] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [newsWarning, setNewsWarning] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [explanations, setExplanations] = useState({});
  const [explanationErrors, setExplanationErrors] = useState({});
  const [explainingIds, setExplainingIds] = useState({});
  const timelineConfig = useMemo(() => buildTimelineConfig(), []);
  const tickerList = Array.isArray(tickers) ? tickers : [];
  const tickerKey = tickerList.join(",");
  const normalizedTickers = useMemo(
    () => tickerKey.split(",").map((ticker) => ticker.trim()).filter(Boolean),
    [tickerKey],
  );
  const load = useCallback(async ({ append = false } = {}) => {
    if (append) {
      setLoadingMore(true);
      setLoadMoreError("");
    }
    else {
      setLoading(true);
      setError(null);
      setLoadMoreError("");
      setBefore(null);
      setHasMore(false);
    }
    try {
      const result = await loadNews({
        category,
        tickers: normalizedTickers,
        limit: 20,
        ...(append && before ? { before } : {}),
      });
      setItems((previous) => append ? [...previous, ...result.items] : result.items);
      setProviders(result.providers || []);
      setRefreshedAt(result.refreshedAt || "");
      setBefore(result.before || null);
      setHasMore(Boolean(result.before));
      setNewsWarning(result.warning?.message || "");
      setError(null);
    } catch (requestError) {
      if (append) setLoadMoreError(requestError.message);
      else {
        setError(requestError);
        setItems([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [before, category, normalizedTickers]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNewsWarning("");
    setBefore(null);
    setHasMore(false);
    loadNews({ category, tickers: normalizedTickers, limit: 20 })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setProviders(result.providers || []);
        setRefreshedAt(result.refreshedAt || "");
        setBefore(result.before || null);
        setHasMore(Boolean(result.before));
        setNewsWarning(result.warning?.message || "");
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError);
        setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [category, normalizedTickers]);

  async function explain(item) {
    const id = item.id;
    if (!id || explanations[id] || explainingIds[id]) return;
    setExplainingIds((previous) => ({ ...previous, [id]: true }));
    setExplanationErrors((previous) => ({ ...previous, [id]: null }));
    try {
      const result = await loadNewsExplanation(id);
      setExplanations((previous) => ({ ...previous, [id]: result }));
    } catch (requestError) {
      setExplanationErrors((previous) => ({
        ...previous,
        [id]: { code: requestError.code || "", message: requestError.message },
      }));
    } finally {
      setExplainingIds((previous) => ({ ...previous, [id]: false }));
    }
  }

  function toggleItem(item) {
    const id = item.id;
    if (expandedId === id) {
      setExpandedId("");
      return;
    }
    setExpandedId(id);
    if (!explanations[id]) explain(item);
  }

  function coachPrompt(item) {
    const headline = item.title || "this news item";
    const symbols = item.tickers || [];
    return `Help me understand this news item without giving a trading signal or financial advice.\nHeadline: ${headline}${symbols.length ? `\nTickers: ${symbols.join(", ")}` : ""}\nExplain what is known from this headline and what uncertainty remains.`;
  }

  function renderItem(item) {
    const id = item.id;
    const isOpen = expandedId === id;
    const publisher = item.publisher || item.source || "Publisher unavailable";
    const publishedAt = itemValue(item, "published_at", "publishedAt");
    const summary = item.summary || "No summary was provided by the news source.";
    const url = safeArticleUrl(item.url || item.article_url || item.articleUrl);
    const tickersForItem = Array.isArray(item.tickers) ? item.tickers : [];
    const explanationError = explanationErrors[id];
    const rateLimited = /RATE_LIMIT|LIMIT/i.test(explanationError?.code || "")
      || explanationError?.message?.toLowerCase().includes("limit")
      || explanationError?.message?.toLowerCase().includes("too many requests");
    return (
      <article className="news-feed-item" key={id}>
        <button
          type="button"
          className="news-feed-item-toggle"
          aria-expanded={isOpen}
          aria-controls={`news-details-${id}`}
          onClick={() => toggleItem(item)}
        >
          <span className="news-feed-item-meta"><strong>{publisher}</strong><time dateTime={publishedAt || undefined}>{relativeTime(publishedAt)}</time></span>
          <strong className="news-feed-headline">{item.title}</strong>
          {tickersForItem.length > 0 && <span className="news-feed-tickers">{tickersForItem.map((ticker) => <span key={ticker}>{ticker}</span>)}</span>}
        </button>
        {isOpen && (
          <div className="news-feed-item-details" id={`news-details-${id}`}>
            <p className="news-feed-summary">{summary}</p>
            {url && <a href={url} target="_blank" rel="noopener noreferrer">Read at {publisher} ↗</a>}
            <section className="news-explanation-panel">
              <h3>What does it mean?</h3>
              {explainingIds[id] && <div className="news-explanation-skeleton" role="status">Preparing an explanation from the headline and summary…</div>}
              {explanations[id] && <Explanation explanation={explanations[id]} />}
              {explanationError && (
                <div role="alert" className="news-feed-error">
                  <p>{rateLimited ? "Explanation limit reached for now. Please try again later." : explanationError.message}</p>
                  <button type="button" onClick={() => explain(item)}>Retry explanation</button>
                </div>
              )}
            </section>
            {onAskCoach && <button type="button" className="secondary-btn news-coach-button" onClick={() => onAskCoach(coachPrompt(item))}>Ask coach about this</button>}
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="news-feed trading-workspace-card" aria-label={scope === "investing" ? "Investing news" : "Market news"}>
      <div className="news-feed-header">
        <div><p className="eyebrow">HEADLINES</p><h2>{scope === "investing" ? "Equities news" : "Market news"}</h2></div>
        <span className="news-updated">{refreshedAt ? `Updated ${relativeTime(refreshedAt)}` : "Update time unavailable"}</span>
      </div>
      <div className="news-filter-chips" role="group" aria-label="News category">
        {NEWS_CATEGORIES.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{label}</button>
        ))}
      </div>

      {loading && <div className="news-feed-loading" role="status"><span /><span /><span /></div>}
      {!loading && error?.code === "NEWS_UNAVAILABLE" && (
        <div className="news-unavailable">
          <p role="alert">{error.message || "The news provider is unavailable right now."}</p>
          <p>TradingView fallback — headlines only; no AI explanation is available for these items.</p>
          <TradingViewWidget scriptName="timeline" config={timelineConfig} height={520} title="TradingView headlines only" />
          <button type="button" onClick={() => load()}>Retry news service</button>
        </div>
      )}
      {!loading && error && error.code !== "NEWS_UNAVAILABLE" && (
        <div className="news-feed-error" role="alert"><p>{error.message}</p><button type="button" onClick={() => load()}>Retry</button></div>
      )}
      {!loading && !error && items.length === 0 && <p className="news-empty">No headlines for this filter.</p>}
      {!loading && !error && newsWarning && <p className="news-stale-warning" role="status">{newsWarning} Showing cached headlines.</p>}
      {!loading && !error && items.length > 0 && <div className="news-feed-list">{items.map(renderItem)}</div>}
      {!loading && !error && hasMore && (
        <button type="button" className="secondary-btn news-load-more" disabled={loadingMore} onClick={() => load({ append: true })}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
      {!loading && !error && loadMoreError && (
        <div className="news-feed-error" role="alert">
          <p>{loadMoreError}</p>
          <button type="button" onClick={() => load({ append: true })}>Retry loading more</button>
        </div>
      )}

      <footer className="news-feed-footer">
        <p>AI explanation based on the headline and summary only. Not financial advice or a prediction.</p>
        <p>News via {providers.length ? providers.join(", ") : "configured providers"}.</p>
      </footer>
    </section>
  );
}

export default NewsFeed;
