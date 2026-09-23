import { useMemo, useState } from "react";

const events = [
  { id: 1, date: "2026-08-14", time: "15:30", currency: "USD", country: "United States", event: "Retail Sales", impact: "High", forecast: "0.5%", previous: "0.6%", action: "Avoid trading immediately before the release." },
  { id: 2, date: "2026-08-14", time: "15:30", currency: "USD", country: "United States", event: "Initial Jobless Claims", impact: "Medium", forecast: "225K", previous: "227K", action: "Watch volatility around the release." },
  { id: 3, date: "2026-08-14", time: "17:00", currency: "USD", country: "United States", event: "Consumer Sentiment", impact: "Medium", forecast: "62.0", previous: "61.8", action: "Wait for the first reaction before entering." },
  { id: 4, date: "2026-08-15", time: "10:00", currency: "EUR", country: "Euro Area", event: "GDP", impact: "High", forecast: "0.3%", previous: "0.2%", action: "Avoid aggressive entries before the release." },
  { id: 5, date: "2026-08-15", time: "11:00", currency: "GBP", country: "United Kingdom", event: "CPI", impact: "High", forecast: "3.7%", previous: "3.8%", action: "Expect increased volatility in GBP pairs." },
];

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

function EventHighlight({ event }) {
  return (
    <div className="market-event-highlight">
      <div><strong>{event.time}</strong><span>{event.date}</span></div>
      <div><strong>{event.event}</strong><small>{event.currency} · {event.country}</small></div>
      <span className={`market-impact impact-${event.impact.toLowerCase()}`}><i aria-hidden="true" />{event.impact}</span>
      <div><span>Forecast</span><strong>{event.forecast || "--"}</strong></div>
    </div>
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
      <header className="topbar market-intelligence-header"><div><p className="eyebrow">MARKET INTELLIGENCE</p><h1>Market News</h1><p>Key market-moving events and financial headlines for the trading session.</p></div><span className="market-page-status">EVENT DATA · CONNECTED</span></header>
      <section className="market-news-controls"><div className="market-news-control-title"><span>FILTERS</span><small>Refine the information stream</small></div><div className="market-news-filter search"><label htmlFor="market-news-search">Search</label><input id="market-news-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Event, country or currency" /></div><div className="market-news-filter"><label htmlFor="market-news-impact">Importance</label><select id="market-news-impact" value={impactFilter} onChange={(event) => setImpactFilter(event.target.value)}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></div><div className="market-news-filter"><label htmlFor="market-news-currency">Market</label><select id="market-news-currency" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}><option>All</option><option>USD</option><option>EUR</option><option>GBP</option></select></div><button className="market-reset" type="button" onClick={resetFilters}>Reset</button></section>
      <section className="market-moving-section"><div className="market-section-heading"><div><p className="eyebrow">MARKET MOVING</p><h2>High-attention catalysts</h2></div><span>{marketMoving.length} high impact</span></div>{marketMoving.length ? <div className="market-moving-grid">{marketMoving.map((event) => <EventHighlight event={event} key={event.id} />)}</div> : <div className="market-inline-empty">No high-impact events match the current filters.</div>}</section>
      <section className="market-latest-section"><div className="market-section-heading"><div><p className="eyebrow">LATEST</p><h2>Event timeline</h2></div><span>{filteredEvents.length} events</span></div>{filteredEvents.length ? <div className="market-event-timeline">{filteredEvents.map((event) => <EventItem event={event} key={event.id} />)}</div> : <div className="market-inline-empty">No events found. Try changing the filters.</div>}</section>
      <section className="market-intelligence-note"><div><p className="eyebrow">TRADING CONTEXT</p><h2>News is context, not a setup.</h2><p>Economic releases can change volatility, but a trade still requires confirmation from your strategy and risk plan.</p></div><span className="market-note-status">SOURCE ATTRIBUTION · EVENT FEED</span></section>
    </div>
  );
}

export default EconomicCalendar;
