import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { formatNewYorkTimestamp } from "../services/sessionWindows";
import { getTradeChartWindow } from "../services/tradeChartData";

function CandleShape({ x, width, payload, parentViewBox, domain }) {
  if (!payload || !parentViewBox || domain[1] <= domain[0]) return null;
  const [minimum, maximum] = domain;
  const priceY = (price) => parentViewBox.y + ((maximum - price) / (maximum - minimum)) * parentViewBox.height;
  const centerX = x + width / 2;
  const rising = payload.close >= payload.open;
  const color = rising ? "#54c7a2" : "#d8757b";
  const bodyTop = priceY(Math.max(payload.open, payload.close));
  const bodyBottom = priceY(Math.min(payload.open, payload.close));
  const bodyWidth = Math.max(3, Math.min(9, width * 0.65));

  return (
    <g className="trade-candle">
      <line x1={centerX} x2={centerX} y1={priceY(payload.high)} y2={priceY(payload.low)} stroke={color} strokeWidth={1.2} />
      <rect x={centerX - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={Math.max(1, bodyBottom - bodyTop)} fill={color} stroke={color} />
    </g>
  );
}

function formatChartTime(timestamp) {
  return formatNewYorkTimestamp(timestamp);
}

function TradeChart({ bars, trade, asset, onClose }) {
  const chartBars = getTradeChartWindow(bars, trade);
  if (!chartBars.length) {
    return <div className="trade-chart-panel"><p>Price bars are unavailable for this trade.</p><button type="button" onClick={onClose}>Close chart</button></div>;
  }

  const minimum = Math.min(...chartBars.map((bar) => bar.low), trade.stopLoss, trade.takeProfit, trade.entryPrice, trade.exitPrice);
  const maximum = Math.max(...chartBars.map((bar) => bar.high), trade.stopLoss, trade.takeProfit, trade.entryPrice, trade.exitPrice);
  const padding = (maximum - minimum) * 0.08 || maximum * 0.01;
  const domain = [minimum - padding, maximum + padding];
  const chartWidth = Math.max(640, chartBars.length * 24);

  return (
    <section className="trade-chart-panel" aria-label={`${asset} trade chart`}>
      <header className="trade-chart-heading">
        <div><p className="eyebrow">TRADE ON CHART</p><h4>{asset} · {trade.direction} · {formatChartTime(trade.entryTimestamp)}</h4></div>
        <button type="button" className="trade-chart-close" onClick={onClose}>Close chart</button>
      </header>
      <div className="trade-chart-scroll">
        <ComposedChart width={chartWidth} height={280} data={chartBars} margin={{ top: 22, right: 72, left: 12, bottom: 28 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(150, 180, 205, 0.12)" />
          <XAxis type="number" dataKey="timestamp" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={formatChartTime} minTickGap={42} stroke="#7f94a8" tick={{ fontSize: 9 }} />
          <YAxis type="number" domain={domain} orientation="right" tickFormatter={(value) => value.toFixed(2)} stroke="#7f94a8" tick={{ fontSize: 9 }} width={58} />
          <Bar dataKey="close" barSize={9} shape={(props) => <CandleShape {...props} domain={domain} />} isAnimationActive={false} />
          <ReferenceLine x={trade.entryTimestamp} stroke="#65c4c4" strokeDasharray="3 3" label={{ value: "Entry", fill: "#65c4c4", position: "insideTopLeft", fontSize: 10 }} />
          <ReferenceLine x={trade.exitTimestamp} stroke="#d9b765" strokeDasharray="3 3" label={{ value: "Exit", fill: "#d9b765", position: "insideTopRight", fontSize: 10 }} />
          <ReferenceLine y={trade.stopLoss} stroke="#cf777e" strokeDasharray="5 4" label={{ value: `SL ${trade.stopLoss.toFixed(2)}`, fill: "#cf777e", position: "right", fontSize: 9 }} />
          <ReferenceLine y={trade.takeProfit} stroke="#54c7a2" strokeDasharray="5 4" label={{ value: `TP ${trade.takeProfit.toFixed(2)}`, fill: "#54c7a2", position: "right", fontSize: 9 }} />
          <ReferenceDot x={trade.entryTimestamp} y={trade.entryPrice} r={4} fill="#65c4c4" stroke="#0b131e" label={{ value: `Entry ${trade.entryPrice.toFixed(2)}`, fill: "#65c4c4", position: "top", fontSize: 9 }} />
          <ReferenceDot x={trade.exitTimestamp} y={trade.exitPrice} r={4} fill="#d9b765" stroke="#0b131e" label={{ value: `Exit ${trade.exitPrice.toFixed(2)}`, fill: "#d9b765", position: "bottom", fontSize: 9 }} />
        </ComposedChart>
      </div>
    </section>
  );
}

export default TradeChart;
