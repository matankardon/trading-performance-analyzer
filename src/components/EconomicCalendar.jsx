import { useMemo } from "react";
import TradingViewWidget from "./TradingViewWidget";
import NewsFeed from "./NewsFeed";
import { EVENT_GUIDE } from "../constants/eventGuide";
import {
  buildEconomicCalendarConfig,
} from "../services/tradingViewWidgetConfigs";

function EventGuide() {
  return (
    <section className="event-guide" aria-labelledby="event-guide-heading">
      <div className="event-guide-heading"><p className="eyebrow">EVERGREEN GUIDE</p><h2 id="event-guide-heading">Event guide</h2></div>
      <div className="event-guide-list">
        {EVENT_GUIDE.map((event) => (
          <details className="event-guide-item" key={event.id}>
            <summary>{event.title}</summary>
            <div className="event-guide-copy">
              <p><strong>What it measures:</strong> {event.measures}</p>
              <p><strong>Why traders watch it:</strong> {event.whyWatch}</p>
              <p><strong>Common market interpretation:</strong> {event.reactions}</p>
              <p><strong>Caution:</strong> {event.caution}</p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function EconomicCalendar({ onAskCoach }) {
  const calendarConfig = useMemo(() => buildEconomicCalendarConfig(), []);
  return (
    <div className="market-intelligence-page">
      <header className="topbar market-intelligence-header">
        <div>
          <p className="eyebrow">MARKET INTELLIGENCE</p>
          <h1>Events &amp; News</h1>
          <p>Economic events from TradingView and headlines from configured news providers.</p>
        </div>
      </header>
      <div className="tradingview-market-widgets news-calendar-layout">
        <section className="trading-workspace-card tradingview-market-calendar">
          <h2>Economic Calendar</h2>
          <TradingViewWidget scriptName="events" config={calendarConfig} height={620} title="Economic calendar" />
          <EventGuide />
        </section>
        <NewsFeed scope="markets" onAskCoach={onAskCoach} />
      </div>
      <p className="tradingview-source-note">Events provided by TradingView; news headlines use the configured news feed.</p>
    </div>
  );
}

export default EconomicCalendar;
