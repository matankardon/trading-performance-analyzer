import { useMemo } from "react";
import TradingViewWidget from "./TradingViewWidget";
import { buildTickerTapeConfig } from "../services/tradingViewWidgetConfigs";
import "./TickerBar.css";

export { TRADING_VIEW_TICKER_SYMBOLS } from "../services/tradingViewWidgetConfigs";

function TickerBar() {
  const config = useMemo(() => buildTickerTapeConfig(), []);
  return (
    <div className="ticker-bar" aria-label="TradingView market ticker">
      <TradingViewWidget
        scriptName="ticker-tape"
        config={config}
        height={38}
        title="Market ticker"
      />
    </div>
  );
}

export default TickerBar;
