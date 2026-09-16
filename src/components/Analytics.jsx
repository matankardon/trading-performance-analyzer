import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import "./Analytics.css";

const setupConditions = [
  ["liquidity_sweep", "Liquidity Sweep"],
  ["mss", "MSS"],
  ["fvg", "FVG"],
  ["displacement", "Displacement"],
  ["order_block", "Order Block"],
  ["stochastic_confirmation", "Stochastic Confirmation"],
];

const qualities = ["A+ Setup", "Valid Setup", "Emotional / Rule Break"];

function valueOf(trade) {
  return Number(trade.pnl || 0);
}

function money(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : "-"}$${Math.abs(number).toFixed(2)}`;
}

function groupTrades(trades, getName) {
  const groups = {};

  trades.forEach((trade) => {
    const name = getName(trade) || "Unknown";

    if (!groups[name]) {
      groups[name] = { name, trades: 0, wins: 0, pnl: 0 };
    }

    groups[name].trades += 1;
    groups[name].pnl += valueOf(trade);

    if (valueOf(trade) > 0) {
      groups[name].wins += 1;
    }
  });

  return Object.values(groups).map((group) => ({
    ...group,
    winRate: group.trades > 0 ? Math.round((group.wins / group.trades) * 100) : 0,
  }));
}

function Metric({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`analytics-metric analytics-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }) {
  return (
    <header className="analytics-section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {description && <p>{description}</p>}
    </header>
  );
}

function ComparisonTable({ data, emptyLabel }) {
  if (data.length === 0) {
    return <div className="analytics-empty-inline">{emptyLabel}</div>;
  }

  const maxPnl = Math.max(...data.map((item) => Math.abs(item.pnl)), 1);

  return (
    <div className="comparison-list">
      {data.map((item) => (
        <div className="comparison-row" key={item.name}>
          <div className="comparison-label"><strong>{item.name}</strong><small>{item.trades} trades · {item.winRate}% win rate</small></div>
          <div className="comparison-bar"><span className={item.pnl >= 0 ? "bar-positive" : "bar-negative"} style={{ width: `${Math.max((Math.abs(item.pnl) / maxPnl) * 100, 4)}%` }} /></div>
          <strong className={item.pnl >= 0 ? "pnl-positive" : "pnl-negative"}>{money(item.pnl)}</strong>
        </div>
      ))}
    </div>
  );
}

function Analytics({ trades = [] }) {
  const performance = useMemo(() => {
    const wins = trades.filter((trade) => valueOf(trade) > 0);
    const losses = trades.filter((trade) => valueOf(trade) < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + valueOf(trade), 0);
    const grossLoss = losses.reduce((sum, trade) => sum + Math.abs(valueOf(trade)), 0);
    const netPnL = trades.reduce((sum, trade) => sum + valueOf(trade), 0);

    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: trades.length - wins.length - losses.length,
      grossProfit,
      grossLoss,
      netPnL,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      averageWin: wins.length ? grossProfit / wins.length : 0,
      averageLoss: losses.length ? grossLoss / losses.length : 0,
      profitFactor: grossLoss ? grossProfit / grossLoss : 0,
      expectancy: trades.length ? netPnL / trades.length : 0,
    };
  }, [trades]);

  const orderedTrades = useMemo(
    () => [...trades].sort((a, b) => new Date(a.date || a.created_at || 0) - new Date(b.date || b.created_at || 0)),
    [trades]
  );

  const equityData = useMemo(() => {
    return orderedTrades.reduce((result, trade, index) => {
      const previous = result[result.length - 1];
      const pnl = (previous?.pnl || 0) + valueOf(trade);
      const peak = Math.max(previous?.peak || 0, pnl);

      result.push({
        trade: index + 1,
        pnl: Number(pnl.toFixed(2)),
        peak,
        drawdown: Number((pnl - peak).toFixed(2)),
      });

      return result;
    }, []);
  }, [orderedTrades]);

  const strategyData = useMemo(() => groupTrades(trades, (trade) => trade.strategy), [trades]);
  const sessionData = useMemo(() => groupTrades(trades, (trade) => trade.session), [trades]);
  const assetData = useMemo(() => groupTrades(trades, (trade) => trade.asset), [trades]);

  const risk = useMemo(() => {
    const streaks = orderedTrades.reduce((state, trade) => {
      const pnl = valueOf(trade);
      const next = { ...state };

      if (pnl > 0) {
        next.currentWinStreak += 1;
        next.currentLossStreak = 0;
        next.winningStreak = Math.max(next.winningStreak, next.currentWinStreak);
      } else if (pnl < 0) {
        next.currentLossStreak += 1;
        next.currentWinStreak = 0;
        next.losingStreak = Math.max(next.losingStreak, next.currentLossStreak);
      }

      next.running += pnl;
      next.peak = Math.max(next.peak, next.running);
      next.maxDrawdown = Math.min(next.maxDrawdown, next.running - next.peak);
      return next;
    }, { currentWinStreak: 0, currentLossStreak: 0, winningStreak: 0, losingStreak: 0, running: 0, peak: 0, maxDrawdown: 0 });

    const largestWin = orderedTrades.reduce((largest, trade) => Math.max(largest, valueOf(trade)), 0);
    const largestLoss = orderedTrades.reduce((largest, trade) => Math.min(largest, valueOf(trade)), 0);

    return { largestWin, largestLoss, winningStreak: streaks.winningStreak, losingStreak: streaks.losingStreak, maxDrawdown: streaks.maxDrawdown, riskReward: performance.averageLoss ? performance.averageWin / performance.averageLoss : 0 };
  }, [orderedTrades, performance.averageLoss, performance.averageWin]);

  const behaviorData = useMemo(() => setupConditions.map(([key, label]) => {
    const matching = trades.filter((trade) => Boolean(trade[key]));
    const wins = matching.filter((trade) => valueOf(trade) > 0).length;
    return { label, trades: matching.length, winRate: matching.length ? Math.round((wins / matching.length) * 100) : 0 };
  }), [trades]);

  const qualityData = useMemo(() => qualities.map((name) => {
    const matching = trades.filter((trade) => trade.trade_quality === name);
    const wins = matching.filter((trade) => valueOf(trade) > 0).length;
    return { name, trades: matching.length, winRate: matching.length ? Math.round((wins / matching.length) * 100) : 0, pnl: matching.reduce((sum, trade) => sum + valueOf(trade), 0) };
  }), [trades]);

  const ruleBreakTrades = trades.filter((trade) => trade.rule_break);
  const cleanTrades = trades.filter((trade) => !trade.rule_break);

  const insights = useMemo(() => {
    if (trades.length < 5) {
      return [];
    }

    const nextInsights = [];
    const bestStrategy = [...strategyData].filter((item) => item.trades >= 2).sort((a, b) => b.winRate - a.winRate)[0];
    const bestSession = [...sessionData].filter((item) => item.trades >= 2).sort((a, b) => b.winRate - a.winRate)[0];
    const mss = behaviorData.find((item) => item.label === "MSS");

    if (bestStrategy) nextInsights.push(`${bestStrategy.name} has the strongest win rate across strategies with at least two trades (${bestStrategy.winRate}%).`);
    if (bestSession) nextInsights.push(`${bestSession.name} is your strongest session by win rate (${bestSession.winRate}%).`);
    if (mss && mss.trades >= 2) nextInsights.push(`Trades with MSS confirmation show a ${mss.winRate}% win rate across ${mss.trades} trades.`);
    if (ruleBreakTrades.length >= 2 && cleanTrades.length >= 2) nextInsights.push(`Rule-break trades are tracked separately: ${ruleBreakTrades.length} rule-break trades versus ${cleanTrades.length} clean trades.`);

    return nextInsights;
  }, [behaviorData, cleanTrades.length, ruleBreakTrades.length, sessionData, strategyData, trades.length]);

  if (trades.length === 0) {
    return <div className="analytics-page"><header className="topbar"><div><p className="eyebrow">PERFORMANCE INTELLIGENCE</p><h1>Analytics</h1></div></header><div className="analytics-empty"><div className="analytics-empty-icon">+</div><h2>No trading data yet</h2><p>Add trades to your journal and this page will automatically analyze your performance.</p></div></div>;
  }

  return (
    <div className="analytics-page">
      <header className="topbar analytics-header"><div><p className="eyebrow">PERFORMANCE INTELLIGENCE</p><h1>Analytics</h1><p className="analytics-subtitle">A structured report on how you perform, where it happens, and what your execution reveals.</p></div></header>

      <section className="analytics-performance-overview">
        <SectionHeading eyebrow="PERFORMANCE OVERVIEW" title="How am I performing?" description="The headline result first, supporting context second." />
        <div className="performance-overview-layout"><div className={`net-pnl-hero ${performance.netPnL >= 0 ? "positive" : "negative"}`}><span>NET P&amp;L</span><strong>{money(performance.netPnL)}</strong><small>{performance.total} recorded trades · {performance.wins} wins · {performance.losses} losses</small></div><div className="performance-supporting-metrics"><Metric label="Win Rate" value={`${performance.winRate.toFixed(1)}%`} detail={`${performance.breakeven} breakeven`} tone="positive" /><Metric label="Profit Factor" value={performance.profitFactor.toFixed(2)} detail="Gross profit / gross loss" /><Metric label="Average Trade" value={money(performance.expectancy)} detail="Expectancy per trade" /></div></div>
      </section>

      <section className="analytics-equity-section"><SectionHeading eyebrow="PERFORMANCE TREND" title="Equity curve" description="Cumulative realized P&amp;L across the recorded trade sequence." /><div className="equity-chart-large"><ResponsiveContainer width="100%" height={350}><AreaChart data={equityData}><defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-trading)" stopOpacity={0.28} /><stop offset="95%" stopColor="var(--color-trading)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="trade" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value, name) => [money(value), name === "pnl" ? "Cumulative P&L" : "Drawdown"]} /><Area type="monotone" dataKey="pnl" stroke="var(--color-trading)" fill="url(#equityFill)" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div><div className="equity-footer"><span>Largest drawdown: {money(risk.maxDrawdown)}</span><span>Latest equity: {money(equityData[equityData.length - 1]?.pnl || 0)}</span></div></section>

      <section className="analytics-comparison-section"><SectionHeading eyebrow="PERFORMANCE BREAKDOWN" title="Where is performance coming from?" description="Compare groups visually before opening the detailed journal." /><div className="comparison-grid"><div className="analytics-report-panel"><h3>Strategy Performance</h3><p>Which strategy performs best?</p><ComparisonTable data={strategyData} emptyLabel="No strategy data available." /></div><div className="analytics-report-panel"><h3>Session Performance</h3><p>Which session performs best?</p><ComparisonTable data={sessionData} emptyLabel="No session data available." /></div><div className="analytics-report-panel"><h3>Asset Performance</h3><p>Which assets contribute most?</p><ComparisonTable data={assetData} emptyLabel="No asset data available." /></div></div></section>

      <section className="analytics-risk-section"><SectionHeading eyebrow="RISK & CONSISTENCY" title="How stable is the performance?" description="Compact risk markers from the existing trade sequence." /><div className="risk-metric-row"><Metric label="Average Win" value={money(performance.averageWin)} detail="Per winning trade" tone="positive" /><Metric label="Average Loss" value={`-${money(performance.averageLoss).replace("-", "")}`} detail="Per losing trade" tone="negative" /><Metric label="Win / Loss Ratio" value={risk.riskReward.toFixed(2)} detail="Average win divided by average loss" /><Metric label="Largest Win" value={money(risk.largestWin)} detail="Single recorded trade" tone="positive" /><Metric label="Largest Loss" value={money(risk.largestLoss)} detail="Single recorded trade" tone="negative" /><Metric label="Best Streak" value={`${risk.winningStreak} wins`} detail={`${risk.losingStreak} losses longest`} /></div></section>

      <section className="analytics-behavior-section"><SectionHeading eyebrow="TRADING BEHAVIOR" title="What does execution reveal?" description="Condition and quality analysis uses only fields recorded in the journal." /><div className="behavior-layout"><div className="analytics-report-panel"><h3>Setup Condition Win Rates</h3><div className="behavior-bars">{behaviorData.map((item) => <div className="behavior-bar-row" key={item.label}><div><span>{item.label}</span><small>{item.trades} trades</small></div><div className="behavior-bar"><span style={{ width: `${item.winRate}%` }} /></div><strong>{item.trades ? `${item.winRate}%` : "--"}</strong></div>)}</div></div><div className="analytics-report-panel"><h3>Rule Compliance</h3><div className="compliance-visual"><div><strong>{trades.length ? `${Math.round((cleanTrades.length / trades.length) * 100)}%` : "--"}</strong><span>Clean trades</span></div><div className="compliance-track"><span style={{ width: `${trades.length ? (cleanTrades.length / trades.length) * 100 : 0}%` }} /></div><p>{ruleBreakTrades.length ? `${ruleBreakTrades.length} rule-break trades recorded.` : "No rule-break trades recorded."}</p></div><div className="quality-mini-list">{qualityData.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.trades ? `${item.winRate}%` : "--"}</strong><small>{item.trades} trades · {money(item.pnl)}</small></div>)}</div></div></div></section>

      <section className="analytics-insights-section"><SectionHeading eyebrow="PERFORMANCE INSIGHTS" title="What should I learn from this?" description="Observations appear only when the journal contains enough supporting trades." />{insights.length ? <ul>{insights.map((insight) => <li key={insight}>{insight}</li>)}</ul> : <div className="analytics-empty-inline">Add at least five trades, with repeated strategies or sessions, to surface transparent performance insights.</div>}</section>
    </div>
  );
}

export default Analytics;
