import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "./Analytics.css";

const setupConditions = [
  ["liquiditySweep", "Liquidity Sweep"],
  ["mss", "MSS"],
  ["fvg", "FVG"],
  ["displacement", "Displacement"],
  ["orderBlock", "Order Block"],
  ["stochasticConfirmation", "Stochastic Confirmation"],
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

function WinRateDonut({ wins, losses, total }) {
  const winRate = total ? (wins / total) * 100 : 0;
  const data = [
    { name: "Wins", value: wins, color: "var(--color-investing)" },
    { name: "Losses", value: losses, color: "#c76d75" },
  ];

  return (
    <div className="analytics-winrate-chart">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="transparent">
            {data.map((entry, index) => (
              <Cell key={`${entry.name}-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="analytics-winrate-center">
        <strong>{total ? `${winRate.toFixed(1)}%` : "--"}</strong>
        <span>Win rate</span>
      </div>
    </div>
  );
}

function DistributionDonut({ title, data }) {
  const chartData = data
    .map((item) => ({ ...item, value: Math.abs(item.pnl) || item.trades }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  const colors = ["var(--terminal-cyan)", "var(--color-investing)", "var(--terminal-amber)", "#c76d75"];

  return (
    <div className="distribution-card">
      <div className="distribution-heading">
        <h3>{title}</h3>
        <span>{data.length} groups</span>
      </div>
      {chartData.length ? (
        <div className="distribution-content">
          <div className="distribution-chart">
            <ResponsiveContainer width="100%" height={126}>
              <PieChart>
                <Pie data={chartData} dataKey="value" innerRadius={34} outerRadius={54} paddingAngle={2} stroke="transparent">
                  {chartData.map((item, index) => <Cell key={item.name} fill={colors[index]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="distribution-legend">
            {chartData.map((item, index) => (
              <div key={item.name}>
                <span><i style={{ background: colors[index] }} />{item.name}</span>
                <strong>{total ? `${Math.round((item.value / total) * 100)}%` : "--"}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : <div className="analytics-empty-inline">No group data yet.</div>}
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
    const matching = trades.filter((trade) => trade.tradeQuality === name);
    const wins = matching.filter((trade) => valueOf(trade) > 0).length;
    return { name, trades: matching.length, winRate: matching.length ? Math.round((wins / matching.length) * 100) : 0, pnl: matching.reduce((sum, trade) => sum + valueOf(trade), 0) };
  }), [trades]);

  const ruleBreakTrades = trades.filter((trade) => trade.ruleBreak);
  const cleanTrades = trades.filter((trade) => !trade.ruleBreak);

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
      <header className="topbar analytics-header"><div><p className="eyebrow">PERFORMANCE INTELLIGENCE</p><h1>Analytics</h1><p className="analytics-subtitle">A simple view of how your trading is going.</p></div></header>

      <section className="analytics-overview-strip">
        <div className={`net-pnl-hero ${performance.netPnL >= 0 ? "positive" : "negative"}`}>
          <span>Net P&amp;L</span>
          <strong>{money(performance.netPnL)}</strong>
          <small>{performance.total} trades · {performance.wins} wins · {performance.losses} losses</small>
        </div>

        <div className="analytics-overview-card analytics-winrate-card">
          <p className="eyebrow">WIN RATE</p>
          <WinRateDonut wins={performance.wins} losses={performance.losses} total={performance.total} />
        </div>

        <div className="analytics-overview-card analytics-key-metrics">
          <p className="eyebrow">MUST KNOW</p>
          <div className="analytics-mini-metric"><span>Profit factor</span><strong>{performance.profitFactor.toFixed(2)}</strong></div>
          <div className="analytics-mini-metric"><span>Expectancy</span><strong>{money(performance.expectancy)}</strong></div>
          <div className="analytics-mini-metric"><span>Best streak</span><strong>{risk.winningStreak} wins</strong></div>
        </div>
      </section>

      <section className="analytics-equity-section">
        <header className="analytics-section-heading compact-heading">
          <div>
            <p className="eyebrow">PERFORMANCE TREND</p>
            <h2>Equity curve</h2>
          </div>
        </header>
        <div className="equity-chart-large">
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={equityData}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-trading)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-trading)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="trade" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => [money(value)]} />
              <Area type="monotone" dataKey="pnl" stroke="var(--color-trading)" fill="url(#equityFill)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="equity-footer"><span>Largest drawdown: {money(risk.maxDrawdown)}</span><span>Latest equity: {money(equityData[equityData.length - 1]?.pnl || 0)}</span></div>
      </section>

      <section className="analytics-consolidated-row">
        <section className="analytics-comparison-section">
          <SectionHeading eyebrow="PERFORMANCE BREAKDOWN" title="What is working?" />
          <div className="distribution-grid">
            <DistributionDonut title="Strategy" data={strategyData} />
            <DistributionDonut title="Session" data={sessionData} />
            <DistributionDonut title="Asset" data={assetData} />
          </div>
        </section>

        <section className="analytics-risk-section">
          <SectionHeading eyebrow="RISK & CONSISTENCY" title="How stable is it?" />
          <div className="risk-stat-grid">
            <div><span>Average win</span><strong className="pnl-positive">{money(performance.averageWin)}</strong></div>
            <div><span>Average loss</span><strong className="pnl-negative">-{money(performance.averageLoss).replace("-", "")}</strong></div>
            <div><span>Win / loss</span><strong>{risk.riskReward.toFixed(2)}</strong></div>
            <div><span>Largest win</span><strong className="pnl-positive">{money(risk.largestWin)}</strong></div>
            <div><span>Largest loss</span><strong className="pnl-negative">{money(risk.largestLoss)}</strong></div>
            <div><span>Best streak</span><strong>{risk.winningStreak} wins</strong></div>
          </div>
        </section>
      </section>

      <section className="analytics-behavior-section">
        <SectionHeading eyebrow="TRADING BEHAVIOR" title="Execution snapshot" />
        <div className="behavior-summary-grid">
          <div className="behavior-bars">{behaviorData.map((item) => <div className="behavior-bar-row" key={item.label}><div><span>{item.label}</span><small>{item.trades} trades</small></div><div className="behavior-bar"><span style={{ width: `${item.winRate}%` }} /></div><strong>{item.trades ? `${item.winRate}%` : "--"}</strong></div>)}</div>
          <div className="behavior-right-summary"><div className="compliance-visual"><div><strong>{trades.length ? `${Math.round((cleanTrades.length / trades.length) * 100)}%` : "--"}</strong><span>Clean trades</span></div><div className="compliance-track"><span style={{ width: `${trades.length ? (cleanTrades.length / trades.length) * 100 : 0}%` }} /></div><p>{ruleBreakTrades.length ? `${ruleBreakTrades.length} rule-break trades recorded.` : "No rule-break trades recorded."}</p></div><div className="insight-inline">{insights.length ? insights[0] : "Add more trades to surface a clear performance insight."}</div></div>
        </div>
      </section>
    </div>
  );
}

export default Analytics;
