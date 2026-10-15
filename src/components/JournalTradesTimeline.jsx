import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildJournalTimeline } from "../services/journalTimeline";

function numeric(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tooltipDate(value) {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Date unavailable";
}

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const { trade } = payload[0].payload;
  return (
    <div className="journal-timeline-tooltip">
      <strong>{tooltipDate(label)}</strong>
      <span>{trade.direction || "Direction not recorded"} · {trade.pnl == null ? "P&L not recorded" : `${Number(trade.pnl) >= 0 ? "+" : "-"}$${Math.abs(Number(trade.pnl)).toFixed(2)}`}</span>
      <span>{payload[0].value} journaled price</span>
    </div>
  );
}

export default function JournalTradesTimeline({ trades = [] }) {
  const timeline = buildJournalTimeline(trades);
  return (
    <section className="journal-trades-timeline" aria-label="Trades timeline">
      <h3>Trades timeline</h3>
      {!trades.length
        ? <p>No journaled trades for this asset and date range.</p>
        : timeline.plottedTradeCount === 0
        ? <p>Journaled trades are available, but entry prices are missing.</p>
        : <>
          <div className="journal-timeline-chart">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeline.rows} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke="rgba(150,180,205,.12)" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => new Date(Number(value)).toISOString().slice(5, 10)}
                  stroke="#9ba7b4"
                />
                <YAxis domain={["auto", "auto"]} stroke="#9ba7b4" width={64} />
                <Tooltip content={<TimelineTooltip />} />
                {timeline.series.map(({ key }) => {
                  const tradeIndex = Number(key.slice("trade-".length));
                  const trade = trades[tradeIndex];
                  const color = numeric(trade.pnl) === null
                    ? "#d4af37"
                    : Number(trade.pnl) >= 0 ? "#78c995" : "#df858d";
                  return <Line key={key} dataKey={key} name={`Trade ${tradeIndex + 1}`} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />;
                })}
                {timeline.references.map((reference) => (
                  <ReferenceLine
                    key={reference.key}
                    segment={[{ x: reference.start, y: reference.price }, { x: reference.end, y: reference.price }]}
                    stroke="#d4af37"
                    strokeDasharray="3 3"
                    label={reference.label}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>}
      {trades.length > 0 && <p className="chart-muted-note">No price bars for this symbol on your data plan — showing your journaled prices only.</p>}
    </section>
  );
}
