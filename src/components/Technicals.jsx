import { useMemo, useState } from "react";
import TradingViewWidget from "./TradingViewWidget";
import { readTradingViewSymbolMap } from "../services/symbolMap";
import {
  buildTechnicalAnalysisConfig,
  buildTechnicalSymbolOptions,
} from "../services/tradingViewWidgetConfigs";

const TECHNICALS_GUIDE = [
  {
    id: "gauge",
    title: "How to read the rating and counts",
    body: "The rating combines moving-average and oscillator signals for the selected symbol and timeframe. Strong Sell through Strong Buy summarize the indicator mix; they are not forecasts. Sell, Neutral, and Buy counts show how many included indicators fall in each group, not the strength or certainty of a future move.",
  },
  {
    id: "timeframe",
    title: "What the timeframe changes",
    body: "The timeframe selector changes the bar interval used to calculate the technical indicators. A shorter interval can react more quickly and produce more noise; a longer interval can smooth short-term movement. Ratings across intervals can differ without either being a guarantee.",
  },
  {
    id: "limits",
    title: "What the rating does and does not capture",
    body: "This third-party rating summarizes technical indicators. It does not incorporate news, event risk, liquidity, your position, or your strategy's setup conditions unless those are represented by the displayed indicators.",
  },
  {
    id: "use",
    title: "How to use it",
    body: "Treat the rating as one confluence input alongside your own strategy checklist and risk plan. It is not a trade signal, recommendation, or substitute for evaluating the underlying chart and your rules.",
  },
  {
    id: "conflicts",
    title: "When timeframes conflict",
    body: "For example, a 1-hour Buy and a 1-day Sell may reflect different horizons or mixed conditions. Decide which timeframe matters to your plan before interpreting the conflict; the difference alone does not resolve direction.",
  },
];

function Technicals({ trades = [], selectedAsset = "", onAskCoach }) {
  const [userMap] = useState(readTradingViewSymbolMap);
  const journaledAssets = useMemo(() => [...new Set(
    trades.map((trade) => String(trade.asset ?? "").trim()).filter(Boolean),
  )], [trades]);
  const options = useMemo(
    () => buildTechnicalSymbolOptions(journaledAssets, userMap),
    [journaledAssets, userMap],
  );
  const selectedAssetSymbol = useMemo(
    () => selectedAsset ? buildTechnicalSymbolOptions([selectedAsset], userMap)[0]?.symbol : null,
    [selectedAsset, userMap],
  );
  const [userSelection, setUserSelection] = useState(null);
  const symbol = selectedAssetSymbol && (!userSelection || userSelection.asset !== selectedAsset)
    ? selectedAssetSymbol
    : userSelection?.symbol || options[0]?.symbol || "OANDA:XAUUSD";

  const config = useMemo(() => buildTechnicalAnalysisConfig(symbol), [symbol]);

  return (
    <div className="market-intelligence-page technicals-page">
      <header className="topbar market-intelligence-header">
        <div>
          <p className="eyebrow">MARKET INTELLIGENCE</p>
          <h1>Technicals</h1>
          <p>Technical rating from TradingView — not a prediction or advice.</p>
        </div>
        <label className="technicals-symbol-select">
          Symbol
          <select aria-label="Technical analysis symbol" value={symbol} onChange={(event) => setUserSelection({ asset: selectedAsset, symbol: event.target.value })}>
            {options.map((option) => <option key={`${option.symbol}-${option.label}`} value={option.symbol}>{option.label} · {option.symbol}</option>)}
          </select>
        </label>
      </header>
      <section className="trading-workspace-card technicals-widget-panel">
        <TradingViewWidget
          scriptName="technical-analysis"
          config={config}
          height={450}
          title={`Technical rating for ${symbol}`}
        />
      </section>
      <section className="technicals-meaning-panel" aria-labelledby="technicals-meaning-heading">
        <p className="eyebrow">INTERPRETATION GUIDE</p>
        <h2 id="technicals-meaning-heading">What does this mean?</h2>
        <div className="technicals-guide-list">
          {TECHNICALS_GUIDE.map((item) => (
            <details key={item.id} className="technicals-guide-item">
              <summary>{item.title}</summary>
              <p>{item.body}</p>
            </details>
          ))}
        </div>
        {onAskCoach && (
          <button
            type="button"
            className="secondary-btn technicals-coach-button"
            onClick={() => onAskCoach(`Help me interpret the TradingView technical rating for ${symbol}. Explain its limits and how I could compare it with my strategy checklist. Do not provide a trading signal or financial advice.`)}
          >
            Ask coach about {symbol}
          </button>
        )}
      </section>
      <p className="tradingview-source-note">Technical rating provided by TradingView.</p>
    </div>
  );
}

export default Technicals;
