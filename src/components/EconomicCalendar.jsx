import { useMemo, useState } from "react";
import DataSourceMeta from "./DataSourceMeta";
import { demoDataMetadata, demoEconomicEvents as events } from "../services/data";

function EventItem({ event, featured = false }) {
  return (
    <article className={`market-event-item ${featured ? "featured" : ""}`}>
      <div className="market-event-time"><strong>{event.time}</strong><span>{event.date}</span></div>
      <div className="market-event-main"><div className="market-event-title"><strong>{event.event}</strong><span>{event.country} · {event.currency}</span></div><span className={`market-impact impact-${event.impact.toLowerCase()}`}><i aria-hidden="true" />{event.impact}</span></div>
      <div className="market-event-values"><div><span>Previous</span><strong>{event.previous || "--"}</strong></div><div><span>Forecast</span><strong>{event.forecast || "--"}</strong></div><div><span>Actual</span><strong>{event.actual || "--"}</strong></div></div>
      <p className="market-event-action"><b>Why it matters</b>{event.action}</p>
    </article>
  );
}

function EconomicCalendar() {
  const [impactFilter, setImpactFilter] = useState("All");
  const [currencyFilter, setCurrencyFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filteredEvents = useMemo(() => events.filter((event) => {
    const searchValue = search.trim().toLowerCase();
    return (impactFilter === "All" || event.impact === impactFilter) &&
      (currencyFilter === "All" || event.currency === currencyFilter) &&
      (!searchValue || event.event.toLowerCase().includes(searchValue) || event.country.toLowerCase().includes(searchValue) || event.currency.toLowerCase().includes(searchValue));
  }), [impactFilter, currencyFilter, search]);

  const marketMoving = filteredEvents.filter((event) => event.impact === "High");

  function resetFilters() {
    setSearch("");
    setImpactFilter("All");
    setCurrencyFilter("All");
  }

  return (
    <div className="market-intelligence-page">
      <header className="topbar market-intelligence-header"><div><p className="eyebrow">MARKET INTELLIGENCE</p><h1>Market News</h1><p>Key market-moving events and financial headlines for the trading session.</p><DataSourceMeta metadata={demoDataMetadata} /></div><span className="market-page-status">EVENT DATA · DEMO</span></header>
      <section className="market-news-controls"><div className="market-news-control-title"><span>FILTERS</span><small>Refine the information stream</small></div><div className="market-news-filter search"><label htmlFor="market-news-search">Search</label><input id="market-news-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Event, country or currency" /></div><div className="market-news-filter"><label htmlFor="market-news-impact">Importance</label><select id="market-news-impact" value={impactFilter} onChange={(event) => setImpactFilter(event.target.value)}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></div><div className="market-news-filter"><label htmlFor="market-news-currency">Market</label><select id="market-news-currency" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}><option>All</option><option>USD</option><option>EUR</option><option>GBP</option></select></div><button className="market-reset" type="button" onClick={resetFilters}>Reset</button></section>
      <section className="market-moving-section"><div className="market-section-heading"><div><p className="eyebrow">MARKET MOVING</p><h2>High-attention catalysts</h2><p>Prioritize releases most likely to affect intraday volatility.</p></div><span>{marketMoving.length} high impact</span></div>{marketMoving.length ? <div className="market-moving-list">{marketMoving.map((event) => <EventItem event={event} featured key={event.id} />)}</div> : <div className="market-inline-empty">No high-impact events match the current filters.</div>}</section>
      <section className="market-latest-section"><div className="market-section-heading"><div><p className="eyebrow">LATEST</p><h2>Event timeline</h2><p>What happened, when it matters, and what to watch.</p></div><span>{filteredEvents.length} events</span></div>{filteredEvents.length ? <div className="market-event-timeline">{filteredEvents.map((event) => <EventItem event={event} key={event.id} />)}</div> : <div className="market-inline-empty">No events found. Try changing the filters.</div>}</section>
      <section className="market-intelligence-note"><div><p className="eyebrow">TRADING CONTEXT</p><h2>News is context, not a setup.</h2><p>Economic releases can change volatility, but a trade still requires confirmation from your strategy and risk plan.</p></div><span className="market-note-status">SOURCE ATTRIBUTION · EVENT FEED</span></section>
    </div>
  );
}

export default EconomicCalendar;
