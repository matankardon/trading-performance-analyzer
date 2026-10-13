import { useMemo, useState } from "react";
import TradingViewWidget from "./TradingViewWidget";
import { readTradingViewSymbolMap } from "../services/symbolMap";
import {
  buildTechnicalAnalysisConfig,
  buildTechnicalSymbolOptions,
} from "../services/tradingViewWidgetConfigs";

function Technicals({ trades = [], selectedAsset = "" }) {
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
      <p className="tradingview-source-note">Technical rating provided by TradingView.</p>
    </div>
  );
}

export default Technicals;
