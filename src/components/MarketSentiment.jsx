import { useMemo, useState } from "react";

const expertOpinions = [
  { id: 1, source: "CNBC", analyst: "Jim Cramer", publicationDate: "2026-08-18", publicationTime: "09:30", asset: "Gold (XAUUSD)", bias: "Bullish", reasoning: "Fed signals potential rate cuts amid economic slowdown concerns. Gold typically benefits from lower rates and increased safe-haven demand.", sourceLink: "https://www.cnbc.com/", sourceType: "Cable News / Market Commentary" },
  { id: 2, source: "Goldman Sachs Economics Research", analyst: "David Kostin", publicationDate: "2026-08-17", publicationTime: "14:00", asset: "S&P 500 (SPX)", bias: "Neutral", reasoning: "Current valuation reflects competing factors: strong earnings growth offset by elevated rate environment. Recommend wait-and-see approach pending inflation data.", sourceLink: "https://www.goldmansachs.com/", sourceType: "Institutional Research" },
  { id: 3, source: "European Central Bank", analyst: "Isabel Schnabel (Member)", publicationDate: "2026-08-16", publicationTime: "10:15", asset: "EUR/USD", bias: "Bearish", reasoning: "Recent remarks suggest ECB data-dependent approach. Expected Q3 GDP weakness supports lower near-term EUR outlook.", sourceLink: "https://www.ecb.europa.eu/", sourceType: "Official Central Bank" },
  { id: 4, source: "Oil Market Intelligence", analyst: "Amrita Sen", publicationDate: "2026-08-18", publicationTime: "07:45", asset: "Crude Oil (CL)", bias: "Bullish", reasoning: "Supply disruption in Middle East combined with expected demand recovery post-seasonal. OPEC production cuts supporting prices.", sourceLink: "https://www.energyintel.com/", sourceType: "Commodity Research" },
  { id: 5, source: "FX Street", analyst: "Editorial Desk", publicationDate: "2026-08-18", publicationTime: "06:20", asset: "GBP/USD", bias: "Neutral", reasoning: "BoE rate decision coming next week. Market awaiting clarity on inflation trajectory. Technical levels 1.2700-1.2900 acting as key resistance.", sourceLink: "https://www.fxstreet.com/", sourceType: "Financial News & Analysis" },
];

const sentimentRows = [
  ["Gold (XAUUSD)", "Bullish", "News and expert views"],
  ["S&P 500 (SPX)", "Neutral", "Valuation and rate context"],
  ["EUR/USD", "Bearish", "Central-bank commentary"],
  ["Crude Oil (CL)", "Bullish", "Commodity research"],
  ["GBP/USD", "Neutral", "Editorial market context"],
];

function SentimentBadge({ bias }) {
  return <span className={`sentiment-state sentiment-${bias.toLowerCase()}`}><i aria-hidden="true" />{bias}</span>;
}

function MarketSentiment() {
  const [selectedBias, setSelectedBias] = useState("All");
  const [search, setSearch] = useState("");

  const filteredOpinions = useMemo(() => expertOpinions.filter((opinion) => {
    const searchValue = search.trim().toLowerCase();
    return (selectedBias === "All" || opinion.bias === selectedBias) && (!searchValue || opinion.asset.toLowerCase().includes(searchValue) || opinion.analyst.toLowerCase().includes(searchValue) || opinion.source.toLowerCase().includes(searchValue) || opinion.reasoning.toLowerCase().includes(searchValue));
  }), [selectedBias, search]);

  const counts = useMemo(() => ({ bullish: expertOpinions.filter((item) => item.bias === "Bullish").length, bearish: expertOpinions.filter((item) => item.bias === "Bearish").length, neutral: expertOpinions.filter((item) => item.bias === "Neutral").length }), []);
  const overall = counts.bullish > counts.bearish ? "Bullish" : counts.bearish > counts.bullish ? "Bearish" : "Neutral";
  const overallStrength = expertOpinions.length ? Math.round((Math.max(counts.bullish, counts.bearish, counts.neutral) / expertOpinions.length) * 100) : 0;

  return (
    <div className="sentiment-dashboard-page">
      <header className="topbar sentiment-dashboard-header"><div><p className="eyebrow">MARKET INTELLIGENCE</p><h1>Market Sentiment</h1><p>Understand how available professional views are leaning across the tracked market set.</p></div><span className="market-page-status">EXTERNAL VIEWS · ATTRIBUTED</span></header>
      <section className="sentiment-overview-band"><div className="sentiment-overview-state"><span>Overall market state</span><strong>{overall}</strong><small>Derived from the available opinion set, not a price prediction.</small></div><div className="sentiment-overview-score"><span>View concentration</span><strong>{overallStrength} / 100</strong><div className="sentiment-overview-meter"><span style={{ width: `${overallStrength}%` }} /></div></div><div className="sentiment-counts"><div><strong>{counts.bullish}</strong><span>Bullish</span></div><div><strong>{counts.neutral}</strong><span>Neutral</span></div><div><strong>{counts.bearish}</strong><span>Bearish</span></div></div></section>
      <section className="sentiment-asset-section"><div className="sentiment-section-heading"><div><p className="eyebrow">SENTIMENT BY ASSET</p><h2>Market reaction map</h2><p>Compact comparison of the current attributed view set.</p></div><span className="sentiment-data-note">No price or positioning score connected</span></div><div className="sentiment-asset-table"><div className="sentiment-asset-table-head"><span>Asset</span><span>Direction</span><span>Signal strength</span><span>Context</span></div>{sentimentRows.map(([asset, bias, context]) => <div className="sentiment-asset-row" key={asset}><strong>{asset}</strong><SentimentBadge bias={bias} /><div className="sentiment-row-meter"><span className={`meter-${bias.toLowerCase()}`} style={{ width: bias === "Neutral" ? "50%" : "70%" }} /></div><small>{context}</small></div>)}</div></section>
      <section className="sentiment-bridge-section"><div><p className="eyebrow">NEWS → MARKET IMPACT → SENTIMENT</p><h2>Connect the explanation chain</h2><p>Automated relationships between headlines, affected assets, and sentiment are not connected yet.</p></div><div className="sentiment-bridge-flow"><span>News source</span><b>→</b><span>Affected market</span><b>→</b><span>Sentiment response</span></div><small className="sentiment-bridge-status">Waiting for linked event and sentiment data</small></section>
      <section className="sentiment-opinion-section"><div className="sentiment-section-heading"><div><p className="eyebrow">EXPERT VIEW</p><h2>What are the experts thinking?</h2><p>Research-style entries with source, timing, asset, and directional stance visible.</p></div></div><div className="sentiment-filters"><label htmlFor="sentiment-search">Search<input id="sentiment-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Asset, analyst, source or view" /></label><label htmlFor="sentiment-bias">Bias<select id="sentiment-bias" value={selectedBias} onChange={(event) => setSelectedBias(event.target.value)}><option>All</option><option>Bullish</option><option>Neutral</option><option>Bearish</option></select></label><button type="button" onClick={() => { setSearch(""); setSelectedBias("All"); }}>Reset</button><span>{filteredOpinions.length} of {expertOpinions.length} views</span></div>{filteredOpinions.length ? <div className="sentiment-research-list">{filteredOpinions.map((opinion) => <article className="sentiment-research-item" key={opinion.id}><div className="sentiment-research-source"><strong>{opinion.source}</strong><small>{opinion.sourceType}</small></div><div className="sentiment-research-headline"><h3>{opinion.reasoning}</h3><SentimentBadge bias={opinion.bias} /></div><div className="sentiment-research-meta"><span>{opinion.analyst}</span><span>{opinion.asset}</span><span>{opinion.publicationDate} · {opinion.publicationTime}</span></div><a href={opinion.sourceLink} target="_blank" rel="noopener noreferrer">Read source <span aria-hidden="true">→</span></a></article>)}</div> : <div className="sentiment-inline-empty">No opinions match the current filters.</div>}</section>
      <section className="sentiment-context-note"><div><p className="eyebrow">TRADING CONTEXT</p><h2>Sentiment is context, not a signal.</h2><p>Use attributed views to frame a setup, then validate price structure, risk, and your own strategy independently.</p></div><span className="market-note-status">SOURCE · TIMESTAMP · BIAS</span></section>
    </div>
  );
}

export default MarketSentiment;