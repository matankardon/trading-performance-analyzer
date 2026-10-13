import { useMemo } from "react";
import TradingViewWidget from "./TradingViewWidget";
import {
  buildEconomicCalendarConfig,
  buildTimelineConfig,
} from "../services/tradingViewWidgetConfigs";

function NewsPipelineExtension({ items = [] }) {
  if (!items.length) return null;
  return <section className="app-news-extension">{items.map((item) => <article key={item.id}>{item.title}</article>)}</section>;
}

function EconomicCalendar() {
  const calendarConfig = useMemo(() => buildEconomicCalendarConfig(), []);
  const timelineConfig = useMemo(() => buildTimelineConfig(), []);
  return (
    <div className="market-intelligence-page">
      <header className="topbar market-intelligence-header">
        <div>
          <p className="eyebrow">MARKET INTELLIGENCE</p>
          <h1>Events &amp; News</h1>
          <p>Economic events and market headlines from TradingView.</p>
        </div>
      </header>
      <div className="tradingview-market-widgets">
        <section className="trading-workspace-card tradingview-market-calendar">
          <h2>Economic Calendar</h2>
          <TradingViewWidget scriptName="events" config={calendarConfig} height={620} title="Economic calendar" />
        </section>
        <section className="trading-workspace-card tradingview-market-timeline">
          <h2>Market News</h2>
          <TradingViewWidget scriptName="timeline" config={timelineConfig} height={620} title="Market news timeline" />
        </section>
      </div>
      <p className="tradingview-source-note">Events and headlines provided by TradingView.</p>
      <NewsPipelineExtension items={[]} />
    </div>
  );
}

export default EconomicCalendar;
