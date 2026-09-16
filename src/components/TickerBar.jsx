import "./TickerBar.css";

// DEMO DATA - replace with real market feed once price data integration exists (see roadmap).
const demoEntries = [
  { symbol: "XAUUSD", price: "2,346.80", change: "+0.84%", direction: "positive" },
  { symbol: "EURUSD", price: "1.0842", change: "-0.21%", direction: "negative" },
  { symbol: "GBPUSD", price: "1.2716", change: "+0.18%", direction: "positive" },
  { symbol: "USDJPY", price: "155.42", change: "-0.36%", direction: "negative" },
  { symbol: "BTCUSD", price: "67,420", change: "+1.27%", direction: "positive" },
  { symbol: "SPX", price: "5,312.40", change: "+0.42%", direction: "positive" },
  { symbol: "NDX", price: "18,205.70", change: "-0.11%", direction: "negative" },
  { symbol: "VIX", price: "13.84", change: "-2.18%", direction: "negative" },
];

function TickerEntry({ entry }) {
  return (
    <span className="ticker-entry" aria-label={`${entry.symbol} ${entry.price} ${entry.change}`}>
      <strong>{entry.symbol}</strong>
      <span>{entry.price}</span>
      <span className={`ticker-change ${entry.direction}`}>{entry.change}</span>
    </span>
  );
}

function TickerBar() {
  return (
    <section className="ticker-bar" aria-label="Demo market ticker">
      <span className="ticker-demo-tag">DEMO DATA</span>
      <div className="ticker-viewport">
        <div className="ticker-track">
          <div className="ticker-group">
            {demoEntries.map((entry) => <TickerEntry key={entry.symbol} entry={entry} />)}
          </div>
          <div className="ticker-group" aria-hidden="true">
            {demoEntries.map((entry) => <TickerEntry key={`duplicate-${entry.symbol}`} entry={entry} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default TickerBar;
