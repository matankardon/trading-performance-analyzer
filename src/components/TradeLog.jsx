import { useEffect, useState } from "react";
import { formatNewYorkTimestamp } from "../services/sessionWindows";
import TradeChart from "./TradeChart";

function currency(value) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function TradeLog({ trades, bars, asset }) {
  const [selectedTradeIndex, setSelectedTradeIndex] = useState(null);

  useEffect(() => {
    if (selectedTradeIndex === null) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedTradeIndex(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTradeIndex]);

  return (
    <div className="backtest-trade-log">
      <p className="eyebrow">TRADE LOG</p>
      <div className="backtest-trade-table-wrap">
        <table>
          <thead>
            <tr><th>Entry time</th><th>Exit time</th><th>Direction</th><th>Entry price</th><th>Exit price</th><th>Exit reason</th><th>P&amp;L</th><th>Bars held</th><th>Chart</th></tr>
          </thead>
          <tbody>
            {trades.length ? trades.map((trade, index) => (
              <FragmentRow
                key={`${trade.entryIndex}-${trade.exitIndex}-${index}`}
                index={index}
                trade={trade}
                selected={selectedTradeIndex === index}
                onSelect={() => setSelectedTradeIndex(selectedTradeIndex === index ? null : index)}
                bars={bars}
                asset={asset}
              />
            )) : <tr><td colSpan="9">No trades recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ index, trade, selected, onSelect, bars, asset }) {
  return (
    <>
      <tr className={`backtest-trade-row trade-outcome-${trade.pnl > 0 ? "win" : trade.pnl < 0 ? "loss" : "flat"}`} style={{ animationDelay: `${Math.min(index, 6) * 24}ms` }}>
        <td>{formatNewYorkTimestamp(trade.entryTimestamp)}</td>
        <td>{formatNewYorkTimestamp(trade.exitTimestamp)}</td>
        <td>{trade.direction}</td>
        <td>{trade.entryPrice.toFixed(4)}</td>
        <td>{trade.exitPrice.toFixed(4)}</td>
        <td>{trade.exitReason === "stop_loss" ? "SL" : trade.exitReason === "take_profit" ? "TP" : "end of data"}</td>
        <td className={`trade-pnl trade-pnl-${trade.pnl > 0 ? "win" : trade.pnl < 0 ? "loss" : "flat"}`}>{currency(trade.pnl)}</td>
        <td>{trade.barsHeld}</td>
        <td><button type="button" className="trade-log-view-chart" aria-expanded={selected} onClick={onSelect}>{selected ? "Hide chart" : "View chart"}</button></td>
      </tr>
      {selected && <tr className="backtest-trade-chart-row"><td colSpan="9"><TradeChart bars={bars} trade={trade} asset={asset} onClose={onSelect} /></td></tr>}
    </>
  );
}

export default TradeLog;
