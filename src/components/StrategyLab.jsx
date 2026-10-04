import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../supabaseClient";
import {
  createBacktestRequest,
  createStrategyDraft,
  strategyConditionCatalog,
  strategyStatuses,
} from "../services/strategyModels";
import {
  dbToStrategy,
  dbToStrategyVersion,
  strategyToDb,
  strategyVersionToDb,
} from "../models/strategy";
import { runBacktest } from "../services/backtestEngine";
import { calculateTakeProfitPercent } from "../services/backtestParameters";
import { buildBacktestConfig } from "../services/backtestConfig";
import { fetchHistoricalBars } from "../services/historicalDataService";
import { ictEntryRule } from "../services/ictEntryRule";
import { formatNewYorkTimestamp } from "../services/sessionWindows";
import { supportedHistoricalTimeframes } from "../../supabase/functions/_shared/timeframe";
import "./StrategyLab.css";

const backtestAssets = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "SPY", "QQQ"];
const backtestSessions = ["All sessions", "New York", "London", "Asia", "Overlap"];
const recentBacktestAssetsStorageKey = "tradeCatalystRecentBacktestAssets";

function HelpTooltip({ id, text }) {
  const [open, setOpen] = useState(false);
  const tooltipId = `${id}-help`;
  return (
    <span
      className="help-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tooltip-trigger"
        aria-label={`Help for ${id}`}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        ?
      </button>
      <span id={tooltipId} className={`help-tooltip-content${open ? " visible" : ""}`} role="tooltip">
        {text}
      </span>
    </span>
  );
}

function FieldLabel({ children, helpId, helpText }) {
  return <span className="field-label">{children}<HelpTooltip id={helpId} text={helpText} /></span>;
}

function loadRecentBacktestAssets() {
  try {
    const stored = JSON.parse(localStorage.getItem(recentBacktestAssetsStorageKey) || "[]");
    return Array.isArray(stored)
      ? stored.filter((asset) => typeof asset === "string").map((asset) => asset.toUpperCase()).slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function saveRecentBacktestAsset(asset, previousAssets) {
  const normalizedAsset = asset.trim().toUpperCase();
  const nextAssets = [normalizedAsset, ...previousAssets.filter((previous) => previous !== normalizedAsset)].slice(0, 6);
  try {
    localStorage.setItem(recentBacktestAssetsStorageKey, JSON.stringify(nextAssets));
  } catch {
    // Recent suggestions are optional when browser storage is unavailable.
  }
  return nextAssets;
}

function LabHeader({ view, onViewChange }) {
  const tabs = [["library", "Strategy Library"], ["builder", "Strategy Builder"], ["backtesting", "Backtesting"], ["compare", "Version Compare"]];
  return (
    <header className="strategy-lab-header">
      <div><p className="eyebrow">STRATEGY DEVELOPMENT</p><h1>Strategy Lab</h1><p>Build a rule set, test a version, learn from the results, then improve it.</p></div>
      <nav className="strategy-lab-tabs" aria-label="Strategy Lab views">{tabs.map(([key, label]) => <button className={view === key ? "active" : ""} type="button" onClick={() => onViewChange(key)} key={key}>{label}</button>)}</nav>
    </header>
  );
}

function EmptyEngineState({ title, description }) {
  return <div className="strategy-engine-empty"><span className="strategy-empty-mark" aria-hidden="true">--</span><h3>{title}</h3><p>{description}</p><span className="strategy-data-status">Engine not connected</span></div>;
}

function StrategyLibrary({ strategies, onCreate, onSelect }) {
  return (
    <section className="strategy-lab-section strategy-library-section">
      <div className="strategy-section-heading"><div><p className="eyebrow">STRATEGY LIBRARY</p><h2>Methods under development</h2><p>Strategies and their versions stay separate from executed trades.</p></div><button className="strategy-primary-action" type="button" onClick={onCreate}>Create strategy</button></div>
      {strategies.length === 0 ? <EmptyEngineState title="Your strategy library is empty" description="Create a draft to define entry logic, risk rules, confirmation conditions, and a version that can be tested later." /> : <div className="strategy-library-list">{strategies.map((strategy) => <button type="button" className="strategy-library-row" key={strategy.id} onClick={() => onSelect(strategy)}><span className="strategy-library-main"><strong>{strategy.name}</strong><small>{strategy.description || "No description yet"}</small></span><span>{strategy.versions.length} version{strategy.versions.length === 1 ? "" : "s"}</span><span className="strategy-status-badge">{strategy.status}</span><span aria-hidden="true">→</span></button>)}</div>}
    </section>
  );
}

function StrategyBuilder({ draft, setDraft, onSave, selectedStrategy }) {
  const update = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
  const toggleCondition = (key) => setDraft((previous) => ({ ...previous, conditions: { ...previous.conditions, [key]: !previous.conditions[key] } }));
  return (
    <section className="strategy-lab-section strategy-builder-section">
      <div className="strategy-section-heading"><div><p className="eyebrow">STRATEGY BUILDER</p><h2>{selectedStrategy ? `Edit ${selectedStrategy.name}` : "Define a strategy"}</h2><p>Progressive disclosure keeps the development workflow readable.</p></div><span className="strategy-data-status">Session draft</span></div>
      <div className="strategy-builder-grid">
        <div className="strategy-builder-column">
          <div className="strategy-builder-group"><span className="strategy-group-label">Strategy overview</span><label>Name<input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. NY Liquidity Reversal" /></label><label>Description<textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="What market behavior does this method target?" rows="3" /></label><div className="strategy-two-fields"><label>Assets<input value={draft.assets} onChange={(event) => update("assets", event.target.value)} placeholder="e.g. XAUUSD, NASDAQ" /></label><label>Timeframe<input value={draft.timeframe} onChange={(event) => update("timeframe", event.target.value)} placeholder="e.g. 5m / 15m" /></label></div><div className="strategy-two-fields"><label>Session<input value={draft.session} onChange={(event) => update("session", event.target.value)} placeholder="e.g. New York" /></label><label>Status<select value={draft.status} onChange={(event) => update("status", event.target.value)}>{strategyStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div></div>
          <div className="strategy-builder-group"><span className="strategy-group-label">Entry and exit logic</span><label>Entry rules<textarea value={draft.entryRules} onChange={(event) => update("entryRules", event.target.value)} placeholder="Describe the sequence required before entry" rows="4" /></label><label>Exit rules<textarea value={draft.exitRules} onChange={(event) => update("exitRules", event.target.value)} placeholder="What invalidates the idea or confirms the exit?" rows="3" /></label></div>
        </div>
        <div className="strategy-builder-column">
          <div className="strategy-builder-group"><span className="strategy-group-label">Risk management</span><label>Stop-loss rules<textarea value={draft.stopLossRules} onChange={(event) => update("stopLossRules", event.target.value)} placeholder="Where is the trade invalidated?" rows="3" /></label><label>Take-profit rules<textarea value={draft.takeProfitRules} onChange={(event) => update("takeProfitRules", event.target.value)} placeholder="How is the target selected?" rows="3" /></label><div className="strategy-two-fields"><label>Risk / reward<input value={draft.riskReward} onChange={(event) => update("riskReward", event.target.value)} placeholder="e.g. 2R" /></label><label>Direction<input value={draft.direction} onChange={(event) => update("direction", event.target.value)} placeholder="Long / Short / Both" /></label></div></div>
          <div className="strategy-builder-group"><span className="strategy-group-label">Confirmation conditions</span><div className="strategy-condition-list">{strategyConditionCatalog.map((condition) => <label className={draft.conditions[condition.key] ? "selected" : ""} key={condition.key}><input type="checkbox" checked={draft.conditions[condition.key]} onChange={() => toggleCondition(condition.key)} /><span>{condition.label}</span><small>{draft.conditions[condition.key] ? "Required" : "Optional"}</small></label>)}</div></div>
          <div className="strategy-builder-group"><label>Notes<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="What would you want to review after a test?" rows="3" /></label></div>
        </div>
      </div>
      <div className="strategy-builder-footer"><span>Saving creates a new in-session version. Existing versions are not overwritten.</span><button className="strategy-primary-action" type="button" onClick={onSave} disabled={!draft.name.trim()}>Save strategy version</button></div>
    </section>
  );
}

function formatPercentage(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function formatMetric(value) {
  if (value === Infinity) return "∞";
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

function formatSharpe(value) {
  return value === null ? "n/a, needs more data" : formatMetric(value);
}

function formatChartTimestamp(value, timeframe) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (/\d+[mh]$/.test(timeframe)) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return date.toLocaleDateString();
}

function ExpandedMetrics({ result }) {
  const metrics = [
    ["Return %", `${formatMetric(result.returnPct)}%`, "return-percent", "Net P&L as a percentage of the starting balance."],
    ["Average win", formatCurrency(result.averageWin), "average-win", "Average realized P&L of winning trades."],
    ["Average loss", formatCurrency(result.averageLoss), "average-loss", "Average realized P&L of losing trades."],
    ["Win/loss ratio", formatMetric(result.winLossRatio), "win-loss-ratio", "Average win divided by the absolute average loss."],
    ["Max consecutive losses", result.maxConsecutiveLosses, "max-consecutive-losses", "Longest uninterrupted sequence of losing trades."],
    ["Largest win", formatCurrency(result.largestWin), "largest-win", "Highest realized P&L from one trade."],
    ["Largest loss", formatCurrency(result.largestLoss), "largest-loss", "Lowest realized P&L from one trade."],
    ["Time in market", `${formatMetric(result.timeInMarketPct)}%`, "time-in-market", "Percentage of tested bars covered by an open position."],
    ["Sharpe ratio", formatSharpe(result.sharpeRatio), "sharpe-ratio", "Annualized daily-return Sharpe ratio; requires at least 30 daily equity points."],
  ];
  return <div className="backtest-expanded-metrics">{metrics.map(([label, value, helpId, helpText]) => <span key={label}><span className="backtest-metric-label">{label}<HelpTooltip id={helpId} text={helpText} /></span><strong>{value}</strong></span>)}</div>;
}

function ResultCaption({ context }) {
  return <p className="backtest-result-caption">Result parameters: {context.asset} · {context.timeframe} · {context.session} · {context.startDate} to {context.endDate} · SL {context.stopLoss}% · R:R {context.riskReward}</p>;
}

function TradeLog({ trades }) {
  return <div className="backtest-trade-log"><p className="eyebrow">TRADE LOG</p><div className="backtest-trade-table-wrap"><table><thead><tr><th>Entry time</th><th>Exit time</th><th>Direction</th><th>Entry price</th><th>Exit price</th><th>Exit reason</th><th>P&amp;L</th><th>Bars held</th></tr></thead><tbody>{trades.length ? trades.map((trade, index) => <tr key={`${trade.entryIndex}-${trade.exitIndex}-${index}`}><td>{formatNewYorkTimestamp(trade.entryTimestamp)}</td><td>{formatNewYorkTimestamp(trade.exitTimestamp)}</td><td>{trade.direction}</td><td>{trade.entryPrice.toFixed(4)}</td><td>{trade.exitPrice.toFixed(4)}</td><td>{trade.exitReason === "stop_loss" ? "SL" : trade.exitReason === "take_profit" ? "TP" : "end of data"}</td><td>{formatCurrency(trade.pnl)}</td><td>{trade.barsHeld}</td></tr>) : <tr><td colSpan="8">No trades recorded.</td></tr>}</tbody></table></div></div>;
}

function BacktestWorkspace({ strategies, request, setRequest }) {
  const [bars, setBars] = useState(null);
  const [backtestResult, setBacktestResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentAssets, setRecentAssets] = useState(loadRecentBacktestAssets);
  const [resultContext, setResultContext] = useState(null);
  const requestInProgress = useRef(false);
  const selectedStrategy = strategies.find((strategy) => strategy.id === request.strategyId);
  const versions = selectedStrategy?.versions || [];
  const selectedVersion = versions.find((version) => version.id === request.versionId);
  const update = (field, value) => setRequest((previous) => ({ ...previous, [field]: value }));

  async function handleRunBacktest() {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    setIsLoading(true);
    setError("");
    setBacktestResult(null);
    setResultContext(null);
    try {
      if (!selectedVersion) {
        throw new Error("Select a strategy version to use its saved entry conditions.");
      }
      const config = buildBacktestConfig(request, { ...selectedVersion, direction: selectedStrategy?.direction });
      const asset = config.historicalRequest.asset;
      if (!asset) throw new Error("Enter an asset ticker before running the backtest.");
      const fetchedBars = await fetchHistoricalBars(
        config.historicalRequest.asset,
        config.historicalRequest.timeframe,
        config.historicalRequest.startDate,
        config.historicalRequest.endDate,
      );
      const entryRule = ictEntryRule(fetchedBars, config.entryRuleOptions);
      const result = runBacktest({
        bars: fetchedBars,
        entryRule,
        ...config.engine,
        debugSignals: new URLSearchParams(window.location.search).get("debugBacktestSignals") === "1",
      });
      setBars(fetchedBars);
      setBacktestResult(result);
      setResultContext({
        asset,
        timeframe: request.timeframe,
        session: request.session || "All sessions",
        startDate: request.startDate,
        endDate: request.endDate,
        stopLoss: request.stopLossPct,
        riskReward: request.riskRewardRatio,
      });
      setRecentAssets((previous) => saveRecentBacktestAsset(asset, previous));
    } catch (fetchError) {
      setBars(null);
      setBacktestResult(null);
      setError(fetchError.message);
    } finally {
      requestInProgress.current = false;
      setIsLoading(false);
    }
  }

  const status = bars
    ? `${bars.length} bars loaded: ${request.startDate} to ${request.endDate}`
    : "No historical data";
  return (
    <section className="strategy-lab-section backtest-section">
      <div className="strategy-section-heading"><div><p className="eyebrow">BACKTESTING INTERFACE</p><h2>Test a strategy version</h2><p>Run a deterministic test over real historical bars using the selected version&apos;s enabled, implemented entry conditions.</p></div><span className="strategy-data-status">{status}</span></div>
      <div className="backtest-request-grid">
        <label><FieldLabel helpId="strategy" helpText="Which saved strategy version&apos;s enabled conditions to test.">Strategy</FieldLabel><select value={request.strategyId} onChange={(event) => update("strategyId", event.target.value)}><option value="">Select strategy</option>{strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select></label>
        <label><FieldLabel helpId="version" helpText="Which saved strategy version&apos;s enabled conditions to test.">Strategy version</FieldLabel><select value={request.versionId} onChange={(event) => update("versionId", event.target.value)} disabled={!selectedStrategy}><option value="">Select version</option>{versions.map((version) => <option value={version.id} key={version.id}>v{version.version}</option>)}</select></label>
        <label><FieldLabel helpId="asset" helpText="Ticker symbol to test, e.g. AAPL.">Asset</FieldLabel><input list="recent-backtest-assets" value={request.asset} onChange={(event) => update("asset", event.target.value.toUpperCase())} placeholder="Ticker, e.g. AAPL" autoComplete="off" /><datalist id="recent-backtest-assets">{recentAssets.map((asset) => <option value={asset} key={asset} />)}{backtestAssets.map((asset) => <option value={asset} key={`common-${asset}`} />)}</datalist></label>
        <label><FieldLabel helpId="timeframe" helpText="Candle size. Smaller means more bars and more noise; wide ranges on small timeframes load slowly.">Timeframe</FieldLabel><select value={request.timeframe} onChange={(event) => update("timeframe", event.target.value)}><option value="">Select timeframe</option>{supportedHistoricalTimeframes.map(({ value }) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><FieldLabel helpId="start-date" helpText="Period of history to test. More history generally makes results more reliable.">Start date</FieldLabel><input type="date" value={request.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
        <label><FieldLabel helpId="end-date" helpText="Period of history to test. More history generally makes results more reliable.">End date</FieldLabel><input type="date" value={request.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
        <label><FieldLabel helpId="session" helpText="Only allow entries during this America/New_York window: Asia 19:00–04:00, London 03:00–12:00, New York 08:00–17:00, or Overlap 08:00–12:00.">Session</FieldLabel><select value={request.session || "All sessions"} onChange={(event) => update("session", event.target.value)}>{backtestSessions.map((session) => <option value={session} key={session}>{session}</option>)}</select></label>
        <label><FieldLabel helpId="risk-per-trade" helpText="How much of your balance to risk per trade, e.g. 1 = 1%.">Risk per trade</FieldLabel><input value={request.riskPerTrade} onChange={(event) => update("riskPerTrade", event.target.value)} placeholder="e.g. 1%" /></label>
        <label><FieldLabel helpId="starting-balance" helpText="Simulated account size in dollars.">Starting balance</FieldLabel><input value={request.startingBalance} onChange={(event) => update("startingBalance", event.target.value)} placeholder="e.g. 10000" /></label>
        <label><FieldLabel helpId="risk-reward" helpText="Take-profit distance as a multiple of your stop-loss, e.g. 2 means win twice what you risk.">Risk:Reward ratio</FieldLabel><input type="number" min="0.01" step="0.01" value={request.riskRewardRatio} onChange={(event) => update("riskRewardRatio", event.target.value)} /><small>→ {formatPercentage(calculateTakeProfitPercent(request.stopLossPct, request.riskRewardRatio))} take-profit</small></label>
      </div>
      <details className="advanced-settings">
        <summary>Advanced settings</summary>
        <div className="advanced-settings-grid">
          <label><FieldLabel helpId="stop-loss" helpText="How far price may move against you before exit, e.g. 0.5.">Stop-loss %</FieldLabel><input type="number" min="0.01" max="100" step="0.01" value={request.stopLossPct} onChange={(event) => update("stopLossPct", event.target.value)} /></label>
          <label><FieldLabel helpId="commission" helpText="Flat fee per round trip, e.g. 1 dollar.">Commission per trade ($)</FieldLabel><input type="number" min="0" step="0.01" value={request.commissionPerTrade} onChange={(event) => update("commissionPerTrade", event.target.value)} /></label>
          <label><FieldLabel helpId="slippage" helpText="Adverse fill difference applied to entry and exit, e.g. 0.05%.">Slippage %</FieldLabel><input type="number" min="0" max="100" step="0.01" value={request.slippagePct} onChange={(event) => update("slippagePct", event.target.value)} /></label>
          <label><FieldLabel helpId="swing-window" helpText="Bars required on each side of a pivot. Raising it confirms fewer, wider swings.">Swing pivot window</FieldLabel><input type="number" min="1" step="1" value={request.swingSize} onChange={(event) => update("swingSize", event.target.value)} /></label>
          <label><FieldLabel helpId="sweep-detection-lookback" helpText="Prior bars used to define the range a wick must sweep. Raising it compares against a wider range.">Sweep detection lookback</FieldLabel><input type="number" min="1" step="1" value={request.sweepDetectionLookback} onChange={(event) => update("sweepDetectionLookback", event.target.value)} /></label>
          <label><FieldLabel helpId="sweep-lookback" helpText="Maximum bars allowed between a sweep and MSS. Raising it allows older sweeps to qualify.">Sweep-to-MSS lookback</FieldLabel><input type="number" min="1" step="1" value={request.sweepLookback} onChange={(event) => update("sweepLookback", event.target.value)} /></label>
          <label><FieldLabel helpId="retest-window" helpText="Maximum bars after MSS for an order-block or FVG retest. Raising it allows later retests.">MSS retest window</FieldLabel><input type="number" min="1" step="1" value={request.setupLookback} onChange={(event) => update("setupLookback", event.target.value)} /></label>
          <label><FieldLabel helpId="stochastic-k" helpText="Number of bars in the stochastic high/low range. Raising it uses a wider range and changes %K more slowly.">Stochastic K period</FieldLabel><input type="number" min="1" step="1" value={request.stochasticKPeriod} onChange={(event) => update("stochasticKPeriod", event.target.value)} /></label>
          <label><FieldLabel helpId="stochastic-d" helpText="Bars averaged for %D. Raising it smooths %D and makes confirmation less responsive.">Stochastic D period</FieldLabel><input type="number" min="1" step="1" value={request.stochasticDPeriod} onChange={(event) => update("stochasticDPeriod", event.target.value)} /></label>
        </div>
      </details>
      <div className="backtest-action-row"><button type="button" className="strategy-primary-action" onClick={handleRunBacktest} disabled={isLoading}>{isLoading ? "Loading historical data..." : "Run backtest"}</button><span role="status" aria-live="polite">{isLoading ? "Loading historical data. Wide intraday ranges may take a moment." : "Uses real historical bars and the selected version&apos;s enabled conditions."}</span></div>
      {error && <p role="alert" className="strategy-error-message">{error}</p>}
      {resultContext && <ResultCaption context={resultContext} />}
      <div className="backtest-results-placeholder"><p className="eyebrow">BACKTEST RESULTS</p><h3>{backtestResult ? "Execution summary" : "Results will appear here"}</h3><p className="backtest-disclaimer">Entries use the selected version&apos;s enabled liquidity sweep, MSS, FVG, order-block, and stochastic conditions. All enabled gates must pass; when both FVG and order block are enabled, either matching directional-zone retest satisfies that zone gate. This is our own rule-based confluence implementation of ICT concepts; detection is based on available OHLC bars and should not be treated as infallible ground truth. Displacement detection is not implemented, so a version requiring it cannot be run.</p>{backtestResult && backtestResult.totalTrades < 30 && <p className="backtest-significance-warning">Only {backtestResult.totalTrades} trades — results are not statistically meaningful yet. Aim for 100+ trades before trusting these metrics.</p>}{backtestResult ? <><div className="backtest-result-labels"><span>Total trades<strong>{backtestResult.totalTrades}</strong></span><span>Win rate<strong>{formatMetric(backtestResult.winRate)}%</strong></span><span>Net P&amp;L<strong>{formatCurrency(backtestResult.netPnl)}</strong></span><span>Profit factor<strong>{formatMetric(backtestResult.profitFactor)}</strong></span><span>Max drawdown<strong>{formatCurrency(backtestResult.maxDrawdown)}</strong></span><span>Expectancy<strong>{formatCurrency(backtestResult.expectancy)}</strong></span></div><div className="backtest-equity-chart"><p className="eyebrow">EQUITY CURVE</p><ResponsiveContainer width="100%" height={240}><LineChart data={backtestResult.equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(150, 180, 205, 0.08)" /><XAxis type="number" dataKey="timestamp" scale="time" domain={["dataMin", "dataMax"]} tickCount={6} minTickGap={24} tickFormatter={(value) => formatChartTimestamp(value, request.timeframe)} stroke="#7f94a8" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(value) => `$${Math.round(value)}`} stroke="#7f94a8" tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => [formatCurrency(value), "Equity"]} labelFormatter={(value) => formatChartTimestamp(value, request.timeframe)} /><Line type="monotone" dataKey="equity" stroke="#65c4c4" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></> : <small>Run a test to calculate metrics from the fetched historical bars.</small>}</div>
      {backtestResult && <ExpandedMetrics result={backtestResult} />}
      <TradeLog trades={backtestResult?.trades || []} />
    </section>
  );
}

function StrategyLab({ initialView = "library", userId, onStrategiesChange }) {
  const [view, setView] = useState(initialView);
  const [strategies, setStrategies] = useState([]);
  const [draft, setDraft] = useState(createStrategyDraft());
  const [request, setRequest] = useState(createBacktestRequest());
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadStrategies() {
      if (!userId) {
        setStrategies([]);
        return;
      }

      const { data: strategyRows, error: strategyError } = await supabase
        .from("strategies")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (strategyError) {
        console.error("Could not load strategies:", strategyError);
        return;
      }

      const ids = (strategyRows || []).map((strategy) => strategy.id);
      const { data: versionRows, error: versionError } = ids.length
        ? await supabase.from("strategy_versions").select("*").in("strategy_id", ids).order("version_number", { ascending: false })
        : { data: [], error: null };

      if (versionError) {
        console.error("Could not load strategy versions:", versionError);
        return;
      }

      if (!active) return;
      const nextStrategies = (strategyRows || []).map((strategy) => dbToStrategy(
        strategy,
        (versionRows || []).filter((version) => version.strategy_id === strategy.id).map(dbToStrategyVersion),
      ));
      setStrategies(nextStrategies);
      onStrategiesChange?.(nextStrategies);
    }

    loadStrategies();
    return () => { active = false; };
  }, [onStrategiesChange, userId]);

  function createStrategy() {
    setSelectedStrategy(null);
    setDraft(createStrategyDraft());
    setView("builder");
  }

  function selectStrategy(strategy) {
    setSelectedStrategy(strategy);
    setDraft({ ...strategy, conditions: { ...strategy.conditions } });
    setView("builder");
  }

  async function saveVersion() {
    if (!draft.name.trim()) return;
    if (!userId) return;

    const existing = selectedStrategy || strategies.find((strategy) => strategy.name === draft.name.trim());
    const strategyPayload = strategyToDb({ ...draft, name: draft.name.trim(), userId });
    const strategyResult = existing
      ? await supabase.from("strategies").update(strategyPayload).eq("id", existing.id).eq("user_id", userId).select().single()
      : await supabase.from("strategies").insert(strategyPayload).select().single();

    if (strategyResult.error) {
      console.error("Could not save strategy:", strategyResult.error);
      return;
    }

    const strategyRow = strategyResult.data;
    const nextVersion = existing ? existing.versions.length + 1 : 1;
    const versionResult = await supabase.from("strategy_versions").insert(strategyVersionToDb({
      ...draft,
      strategyId: strategyRow.id,
      version: nextVersion,
    })).select().single();

    if (versionResult.error) {
      console.error("Could not save strategy version:", versionResult.error);
      return;
    }

    const version = dbToStrategyVersion(versionResult.data);
    const strategy = dbToStrategy(strategyRow, [...(existing?.versions || []), version]);
    const nextStrategies = existing
      ? strategies.map((item) => item.id === existing.id ? strategy : item)
      : [strategy, ...strategies];
    setStrategies(nextStrategies);
    onStrategiesChange?.(nextStrategies);
    setSelectedStrategy(strategy);
    setView("library");
  }

  return (
    <div className="strategy-lab-page">
      <LabHeader view={view} onViewChange={setView} />
      {view === "library" && <StrategyLibrary strategies={strategies} onCreate={createStrategy} onSelect={selectStrategy} />}
      {view === "builder" && <StrategyBuilder draft={draft} setDraft={setDraft} onSave={saveVersion} selectedStrategy={selectedStrategy} />}
      {view === "backtesting" && <BacktestWorkspace strategies={strategies} request={request} setRequest={setRequest} />}
      {view === "compare" && <section className="strategy-lab-section"><div className="strategy-section-heading"><div><p className="eyebrow">VERSION COMPARISON</p><h2>Did the strategy improve?</h2><p>Compare measured results only after real backtest runs exist.</p></div></div><EmptyEngineState title="No completed versions to compare" description="Version comparison will show win rate, profit factor, net P&amp;L, drawdown, expectancy, and trade count once a real engine produces results." /></section>}
    </div>
  );
}

export default StrategyLab;
