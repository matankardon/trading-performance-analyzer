import { useMemo, useState } from "react";
import { MARKET_SCORE_EXPLANATIONS } from "../constants/marketScoreExplanations";
import { isTimestampInSession } from "../services/sessionWindows";
import {
  MARKET_DATA_SOURCE,
  MARKET_TIMEFRAMES,
  useMarketData,
} from "../services/useMarketData";
import { readLastUsedSetupChecklist } from "../services/setupChecklist";
import ChartWorkspace from "./ChartWorkspace";
import "./MarketWorkspace.css";

const COMPONENT_LABELS = Object.freeze({
  trend: "Trend",
  structure: "Structure",
  momentum: "Momentum",
  volatility: "Volatility",
  volume: "Volume",
});

const SUGGESTED_SYMBOLS = ["SPY", "QQQ", "AAPL", "EURUSD"];

function formatPrice(value) {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })
    : "--";
}

function formatChange(value, percent = false) {
  if (!Number.isFinite(value)) return "Unavailable";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}${percent ? "%" : ""}`;
}

function formatUtc(timestamp) {
  return Number.isFinite(timestamp)
    ? `${new Date(timestamp).toISOString().replace("T", " ").slice(0, 19)} UTC`
    : "Unavailable";
}

function activeSession(timestamp) {
  if (!Number.isFinite(timestamp)) return "Unavailable";
  return ["Overlap", "New York", "London", "Asia"]
    .find((session) => isTimestampInSession(timestamp, session))
    || "Outside listed sessions";
}

function MarketHeader({ market, asset, trades, onAssetChange, timeframe, onTimeframeChange }) {
  const journaledAssets = [...new Set(trades.map(({ asset: name }) => String(name || "").trim()).filter(Boolean))];
  const symbols = [...new Set([...journaledAssets, ...SUGGESTED_SYMBOLS])];
  const latest = market.latest;

  return (
    <section className="market-workspace-card market-data-header">
      <div className="market-data-heading">
        <div>
          <p className="eyebrow">MARKET OVERVIEW · HISTORICAL DATA</p>
          <label className="market-symbol-label" htmlFor="market-symbol">Selected symbol</label>
          <input
            id="market-symbol"
            list="market-symbol-suggestions"
            value={asset}
            onChange={(event) => onAssetChange(event.target.value)}
            placeholder="Enter a ticker"
            autoComplete="off"
          />
          <datalist id="market-symbol-suggestions">
            {symbols.map((symbol) => <option key={symbol} value={symbol} />)}
          </datalist>
        </div>
        <div className="market-latest-price">
          <strong>{latest ? formatPrice(latest.price) : "--"}</strong>
          <span className={latest?.change > 0 ? "market-positive" : latest?.change < 0 ? "market-negative" : ""}>
            {latest
              ? `${formatChange(latest.change)} (${formatChange(latest.changePercent, true)})`
              : "Price change unavailable"}
          </span>
        </div>
      </div>
      <div className="market-data-toolbar">
        <div className="market-timeframe-chips" aria-label="Market timeframe">
          {MARKET_TIMEFRAMES.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={timeframe === item}
              className={timeframe === item ? "selected" : ""}
              onClick={() => onTimeframeChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button type="button" className="market-refresh-btn" onClick={market.refresh} disabled={market.status === "loading"}>
          {market.status === "loading" ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div className="market-data-meta">
        <span>Session at last bar: {activeSession(latest?.timestamp)}</span>
        <span>Last bar: {formatUtc(market.lastBar)} · historical bars</span>
        <span>Source: {market.source}</span>
        {market.cached && <span>Cached within the last 5 minutes</span>}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="market-loading-state" role="status" aria-label="Loading historical market data">
      <div className="market-shimmer market-shimmer-wide" />
      <div className="market-loading-grid">
        <div className="market-shimmer" />
        <div className="market-shimmer" />
        <div className="market-shimmer" />
      </div>
      <div className="market-shimmer market-shimmer-tall" />
    </div>
  );
}

function MarketDataState({ market, onPageChange }) {
  if (market.status === "loading") return <LoadingState />;
  if (market.status === "error") {
    return (
      <section className="market-workspace-card market-empty-state" role="alert">
        <h2>Historical market data could not be loaded</h2>
        <p>{market.error}</p>
        {market.error.startsWith("Rate limit:") && <p>Rate-limit response received from the historical data provider.</p>}
        {market.triedSymbols?.length > 0 && <small>Symbols tried: {market.triedSymbols.join(", ")}</small>}
        <button type="button" className="market-action-link" onClick={market.refresh}>Retry</button>
      </section>
    );
  }
  if (market.status === "nodata") {
    return (
      <section className="market-workspace-card market-empty-state">
        <h2>No data for this symbol on the current data plan</h2>
        <p>Try a supported symbol for your plan. Availability can vary by asset class.</p>
        <p className="market-suggestions">Suggested tickers: {SUGGESTED_SYMBOLS.join(", ")}</p>
        <button type="button" className="market-action-link" onClick={() => onPageChange("Chart")}>Open Chart tab</button>
      </section>
    );
  }
  return null;
}

function ComponentRows({ components, detail = false }) {
  return (
    <div className={detail ? "market-component-list market-component-list-detail" : "market-component-list"}>
      {components.map((item) => {
        const percent = Math.max(0, Math.min(100, Number(item.score) || 0));
        const explanation = MARKET_SCORE_EXPLANATIONS[item.key];
        return (
          <details className="market-component-row" key={item.key}>
            <summary>
              <span>{item.label}</span>
              <span className="market-component-meter" aria-label={`${item.score} out of 100`}>
                <span style={{ width: `${percent}%` }} />
              </span>
              <strong>{item.available ? `${item.score} / 100` : "Unavailable"}</strong>
            </summary>
            <div className="market-component-reading">
              <p>{item.value}</p>
              <p>{item.explanation}</p>
              {detail && item.direction !== null && (
                <p>Direction: {item.direction > 0 ? "Upward" : item.direction < 0 ? "Downward" : "Mixed"}.</p>
              )}
              {explanation && (
                <details className="market-meaning">
                  <summary>What does it mean?</summary>
                  <p>{explanation.text}</p>
                </details>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function MarketTradingScore({ result }) {
  const availableCount = result?.components?.filter(({ available }) => available).length || 0;
  const score = result?.available ? result.score : null;
  return (
    <section className="market-workspace-card market-score-card">
      <div className="market-score-heading">
        <div>
          <p className="eyebrow">MARKET TRADING SCORE</p>
          <h2>{score === null ? "Score unavailable" : `${score} / 100 · ${result.band}`}</h2>
          <p>How favorable is this environment for short-term trading? Decision support only, not a prediction.</p>
        </div>
        <strong className="market-score-number">{score ?? "--"}</strong>
      </div>
      <p className="market-component-count">Based on {availableCount} of 5 components</p>
      {result?.reasons?.map((reason) => <p className="market-score-reason" key={reason}>{reason}</p>)}
      {result?.components?.length > 0 && <ComponentRows components={result.components} />}
      <p className="market-score-omissions">Not included yet: event risk, cross-market context, sentiment.</p>
    </section>
  );
}

function BiasSummary({ result }) {
  if (!result) return "Unavailable";
  const aligned = Object.entries(result.biasDetail || {})
    .filter(([, direction]) => (
      result.bias === "Bullish" ? direction === 1 : result.bias === "Bearish" && direction === -1
    ))
    .map(([key]) => COMPONENT_LABELS[key]);
  return aligned.length
    ? `${result.bias} · aligned: ${aligned.join(", ")}`
    : `${result.bias} · trend, structure, and momentum do not all agree`;
}

function SetupCard({ checklist }) {
  return (
    <div>
      <strong>{checklist.score.met} of {checklist.score.total} conditions · {checklist.band}</strong>
      <small>{checklist.strategy.name} · v{checklist.version.version}</small>
    </div>
  );
}

function decisionText(result, checklist) {
  if (!result?.available) return "Historical data is not sufficient for a market-environment assessment.";
  if (result.band === "Unfavorable") return "The current environment-quality reading is unfavorable; this assessment alone does not establish whether a setup is suitable.";
  if (!checklist) return `The environment is ${result.band.toLowerCase()}, but a strategy checklist has not been run for its latest saved version.`;
  if (checklist.band === "Ready") return `The environment is ${result.band.toLowerCase()} and the saved checklist is marked ready; review the underlying bars and your own criteria.`;
  if (checklist.band === "Not ready") return `The environment is ${result.band.toLowerCase()}, while required checklist conditions remain unmet.`;
  return `The environment is ${result.band.toLowerCase()} and your checklist is partial — remaining conditions are not confirmed.`;
}

function OverviewPage({ market, trades, strategyLibrary, selectedAsset, onAssetChange, onTimeframeChange, timeframe, onPageChange }) {
  const [showMore, setShowMore] = useState(false);
  const checklist = useMemo(() => readLastUsedSetupChecklist(strategyLibrary), [strategyLibrary]);
  const result = market.result;
  return (
    <>
      <MarketHeader market={market} asset={selectedAsset} trades={trades} onAssetChange={onAssetChange} timeframe={timeframe} onTimeframeChange={onTimeframeChange} />
      <MarketDataState market={market} onPageChange={onPageChange} />
      {market.status === "ready" && (
        <>
          <div className="market-overview-grid">
            <MarketTradingScore result={result} />
            <section className="market-workspace-card market-action-card">
              <p className="eyebrow">WHAT SHOULD I DO?</p>
              <p>{decisionText(result, checklist)}</p>
              <small>Decision support. Not advice.</small>
            </section>
          </div>
          <section className="market-workspace-card market-status-strip">
            <div><span>Market status</span><strong>{result?.band || "Unavailable"}</strong><small>Environment quality, not price direction</small></div>
            <div><span>Bias</span><strong>{result?.bias || "Unavailable"}</strong><small>{BiasSummary({ result })}</small></div>
            {checklist && <div><span>Setup</span><SetupCard checklist={checklist} /></div>}
          </section>
          <button type="button" className="market-action-link market-more-button" onClick={() => setShowMore((visible) => !visible)}>
            {showMore ? "Hide more detail" : "See more detail"}
          </button>
          {showMore && (
            <section className="market-workspace-card market-more-detail">
              <h2>What does this mean?</h2>
              <p>Observed historical bars feed the component readings above. The score summarizes environment quality; directional bias is separate, and neither is a forecast. Incomplete or unavailable components reduce the evidence available for interpretation.</p>
              <button type="button" className="market-action-link" onClick={() => onPageChange("Markets")}>See full market detail</button>
            </section>
          )}
          <nav className="market-continue-links" aria-label="Continue to">
            <span>Continue to</span>
            {["Markets", "Strategy Lab", "Chart", "Events & News", "Technicals"].map((page) => (
              <button type="button" key={page} onClick={() => onPageChange(page)}>{page} <span aria-hidden="true">→</span></button>
            ))}
          </nav>
        </>
      )}
    </>
  );
}

function KeyLevels({ levels }) {
  const rows = [
    ["Previous-day high", levels.previousDayHigh],
    ["Previous-day low", levels.previousDayLow],
    ["Previous-day close", levels.previousDayClose],
    ["Current-day open", levels.currentDayOpen],
    ["Current-day high", levels.currentDayHigh],
    ["Current-day low", levels.currentDayLow],
    ["Latest swing high", levels.latestSwingHigh],
    ["Latest swing low", levels.latestSwingLow],
    ["ATR14", levels.atr14],
  ];
  return (
    <section className="market-workspace-card">
      <div className="market-section-title"><h2>Key levels</h2><small>Source: {MARKET_DATA_SOURCE} · UTC day boundaries</small></div>
      <div className="market-level-table">
        {rows.map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{Number.isFinite(value) ? formatPrice(value) : "Unavailable"}</strong></div>
        ))}
      </div>
      <small className="market-utc-note">Previous and current day use UTC boundaries; values are calculated from the displayed historical bars.</small>
    </section>
  );
}

function MarketPage({ market, trades, selectedAsset, onAssetChange, timeframe, onTimeframeChange, onPageChange }) {
  return (
    <>
      <MarketHeader market={market} asset={selectedAsset} trades={trades} onAssetChange={onAssetChange} timeframe={timeframe} onTimeframeChange={onTimeframeChange} />
      <div className="market-page-heading"><p className="eyebrow">MARKET DETAIL</p><h2>Historical conditions and levels</h2></div>
      <MarketDataState market={market} onPageChange={onPageChange} />
      {market.status === "ready" && (
        <>
          <MarketTradingScore result={market.result} />
          <section className="market-workspace-card">
            <div className="market-section-title">
              <div><p className="eyebrow">COMPONENT DETAIL</p><h2>Evidence from the selected historical bars</h2></div>
              <small>Source: {market.source} · Last bar: {formatUtc(market.lastBar)}</small>
            </div>
            <ComponentRows components={market.result?.components || []} detail />
          </section>
          {market.levels && <KeyLevels levels={market.levels} />}
          <section className="market-workspace-card market-cross-market">
            <h2>Cross-market context</h2>
            <p>Not connected yet. No related-asset values are inferred.</p>
            <small>Source: no cross-market provider connected · unavailable</small>
          </section>
        </>
      )}
    </>
  );
}

function DayTradingDashboard({
  page = "Overview",
  trades = [],
  strategyLibrary = [],
  onAddTrade,
  onViewTrade,
  selectedAsset = "",
  onAssetChange = () => {},
  marketTimeframe = "1h",
  onMarketTimeframeChange = () => {},
  onPageChange = () => {},
}) {
  const market = useMarketData(selectedAsset, marketTimeframe);

  return (
    <div className="day-trading-dashboard">
      <header className="topbar dashboard-v2-header">
        <div>
          <p className="eyebrow">DAY TRADING / {page.toUpperCase()}</p>
          <h1>{page === "Overview" ? "What is happening right now?" : page}</h1>
          <p className="dashboard-v2-subtitle">
            {page === "Overview"
              ? "Understand historical market conditions before interpreting the current environment."
              : "A focused workspace for the next layer of your trading process."}
          </p>
        </div>
        {page === "Overview" && <div className="dashboard-v2-actions"><button className="add-trade-btn" type="button" onClick={onAddTrade}>+ Add Trade</button></div>}
      </header>
      {page === "Overview" && (
        <OverviewPage
          market={market}
          trades={trades}
          strategyLibrary={strategyLibrary}
          selectedAsset={selectedAsset}
          onAssetChange={onAssetChange}
          onTimeframeChange={onMarketTimeframeChange}
          timeframe={marketTimeframe}
          onPageChange={onPageChange}
        />
      )}
      {page === "Markets" && (
        <MarketPage
          market={market}
          trades={trades}
          selectedAsset={selectedAsset}
          onAssetChange={onAssetChange}
          timeframe={marketTimeframe}
          onTimeframeChange={onMarketTimeframeChange}
          onPageChange={onPageChange}
        />
      )}
      {page === "Chart" && <ChartWorkspace trades={trades} strategyLibrary={strategyLibrary} selectedAsset={selectedAsset} onAssetChange={onAssetChange} onViewTrade={onViewTrade} onPageChange={onPageChange} />}
    </div>
  );
}

export default DayTradingDashboard;
