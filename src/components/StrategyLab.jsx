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
  indicatorConditionCatalog,
  strategyConditionCatalog,
  strategyStatuses,
} from "../services/strategyModels";
import {
  dbToStrategy,
  dbToStrategyVersion,
  strategyToDb,
  strategyVersionToDb,
} from "../models/strategy";
import { dbToBacktestResult, backtestResultToDb } from "../models/backtestResult";
import { runBacktest } from "../services/backtestEngine";
import { calculateTakeProfitPercent } from "../services/backtestParameters";
import { buildBacktestConfig } from "../services/backtestConfig";
import { fetchHistoricalBars } from "../services/historicalDataService";
import { ictEntryRule } from "../services/ictEntryRule";
import { fetchStrategyLibrary } from "../services/strategyLibrary";
import { compareForwardToBacktest, computeAdherence, computeForwardStats } from "../services/forwardTestStats";
import { supportedHistoricalTimeframes } from "../../supabase/functions/_shared/timeframe";
import TradeLog from "./TradeLog";
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
  const tabs = [["library", "Strategy Library"], ["builder", "Strategy Builder"], ["backtesting", "Backtesting"], ["compare", "Version Compare"], ["forward-test", "Forward Test"]];
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
  const updateIndicatorSetting = (conditionKey, parameterKey, value) => setDraft((previous) => ({
    ...previous,
    conditions: {
      ...previous.conditions,
      indicatorSettings: {
        ...previous.conditions.indicatorSettings,
        [conditionKey]: {
          ...previous.conditions.indicatorSettings?.[conditionKey],
          [parameterKey]: parameterKey === "priceRelation" || parameterKey === "crossover" ? value : Number(value),
        },
      },
    },
  }));
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
          <div className="strategy-builder-group"><span className="strategy-group-label">Confirmation conditions</span><div className="strategy-condition-list">{strategyConditionCatalog.map((condition) => {
            const indicator = indicatorConditionCatalog.find(({ key }) => key === condition.key);
            const enabled = Boolean(draft.conditions[condition.key]);
              return <div className={`strategy-condition-item${enabled ? " selected" : ""}`} key={condition.key}><label><input type="checkbox" checked={enabled} onChange={() => toggleCondition(condition.key)} /><span>{condition.label}{indicator && <HelpTooltip id={`indicator-${condition.key}`} text={indicator.help} />}</span><small>{enabled ? "Required" : "Optional"}</small></label>{indicator && enabled && <div className="indicator-condition-settings"><p>{indicator.help}</p>{indicator.parameters.map((parameter) => <label key={parameter.key}>{parameter.label}{parameter.type === "select" ? <select value={draft.conditions.indicatorSettings?.[condition.key]?.[parameter.key] ?? parameter.defaultValue} onChange={(event) => updateIndicatorSetting(condition.key, parameter.key, event.target.value)}>{parameter.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type="number" min={parameter.min} step={parameter.step || 1} value={draft.conditions.indicatorSettings?.[condition.key]?.[parameter.key] ?? parameter.defaultValue} onChange={(event) => updateIndicatorSetting(condition.key, parameter.key, event.target.value)} />}</label>)}</div>}</div>;
          })}</div><small className="indicator-config-note">Indicator conditions are saved with this version; they do not affect backtest entries yet.</small></div>
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

function BacktestWorkspace({ strategies, request, setRequest, userId }) {
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
      const resultMetrics = Object.fromEntries(
        Object.entries(result).filter(([key]) => !["trades", "equityCurve"].includes(key)),
      );
      const persistedResult = backtestResultToDb({
        userId,
        strategyVersionId: selectedVersion.id,
        asset,
        timeframe: request.timeframe,
        session: request.session || "All sessions",
        startDate: request.startDate,
        endDate: request.endDate,
        config,
        metrics: {
          ...resultMetrics,
          equityCurve: result.equityCurve,
          sizeCappedTradeCount: result.sizeCappedTradeCount,
        },
        trades: result.trades,
      });
      const { error: saveError } = await supabase
        .from("backtest_results")
        .insert(persistedResult)
        .select();
      if (saveError) {
        console.error("Could not save completed backtest:", saveError);
      }
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
        <label><FieldLabel helpId="session" helpText="Entry window in New York time: Asia 19–04, London 03–12, New York 08–17, Overlap 08–12.">Session</FieldLabel><select value={request.session || "All sessions"} onChange={(event) => update("session", event.target.value)}>{backtestSessions.map((session) => <option value={session} key={session}>{session}</option>)}</select></label>
        <label className="risk-per-trade-field"><FieldLabel helpId="risk-per-trade" helpText="Choose % of balance (1 = 1%) or a fixed dollar risk amount, which cannot exceed starting balance.">Risk per trade</FieldLabel><span className="risk-mode-toggle" role="group" aria-label="Risk per trade mode"><button type="button" aria-pressed={request.riskMode === "percent"} onClick={() => update("riskMode", "percent")}>%</button><button type="button" aria-pressed={request.riskMode === "dollars"} onClick={() => update("riskMode", "dollars")}>$</button></span><input type="number" min="0.01" max={request.riskMode === "dollars" ? Number(request.startingBalance) || undefined : 100} step="0.01" value={request.riskPerTrade} onChange={(event) => update("riskPerTrade", event.target.value)} placeholder={request.riskMode === "dollars" ? "Dollar amount" : "e.g. 1 for 1%"} /><small>{request.riskMode === "dollars" ? `Risk amount up to ${request.startingBalance || "starting balance"}` : "Percentage of starting balance"}</small></label>
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
      <div className="backtest-results-placeholder"><p className="eyebrow">BACKTEST RESULTS</p><h3>{backtestResult ? "Execution summary" : "Results will appear here"}</h3><p className="backtest-disclaimer">Rule-based ICT signals from OHLC bars; not ground truth. Displacement detection is unavailable.<HelpTooltip id="ict-scope" text="All enabled gates must pass; FVG and order-block taps are alternative zone confirmations. Detection uses OHLC-only approximations and can differ from chart interpretation." /></p>{backtestResult && backtestResult.totalTrades < 30 && <p className="backtest-significance-warning">Only {backtestResult.totalTrades} trades; sample is too small to trust. Target: 100+.</p>}{backtestResult ? <><div className="backtest-result-labels"><span>Total trades<strong>{backtestResult.totalTrades}</strong></span><span>Win rate<strong>{formatMetric(backtestResult.winRate)}%</strong></span><span>Net P&amp;L<strong>{formatCurrency(backtestResult.netPnl)}</strong></span><span>Profit factor<strong>{formatMetric(backtestResult.profitFactor)}</strong></span><span>Max drawdown<strong>{formatCurrency(backtestResult.maxDrawdown)}</strong></span><span>Expectancy<strong>{formatCurrency(backtestResult.expectancy)}</strong></span></div><div className="backtest-equity-chart"><p className="eyebrow">EQUITY CURVE</p><ResponsiveContainer width="100%" height={240}><LineChart data={backtestResult.equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(150, 180, 205, 0.08)" /><XAxis type="number" dataKey="timestamp" scale="time" domain={["dataMin", "dataMax"]} tickCount={6} minTickGap={24} tickFormatter={(value) => formatChartTimestamp(value, request.timeframe)} stroke="#7f94a8" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(value) => `$${Math.round(value)}`} stroke="#7f94a8" tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => [formatCurrency(value), "Equity"]} labelFormatter={(value) => formatChartTimestamp(value, request.timeframe)} /><Line type="monotone" dataKey="equity" stroke="#65c4c4" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></> : <small>Run a test to calculate metrics from the fetched historical bars.</small>}</div>
      {backtestResult && backtestResult.sizeCappedTradeCount > 0 && <p className="backtest-size-cap-note">{backtestResult.sizeCappedTradeCount} trade(s) were size-capped at 1x account equity — your stop-loss % and risk per trade implied a larger position than your balance allows.</p>}
      {backtestResult && <ExpandedMetrics result={backtestResult} />}
      <TradeLog trades={backtestResult?.trades || []} bars={bars || []} asset={resultContext?.asset || request.asset} />
    </section>
  );
}

function VersionCompare({ strategies, selectedStrategy, userId }) {
  const [compareStrategyId, setCompareStrategyId] = useState(null);
  const [savedRunsState, setSavedRunsState] = useState({ strategyId: "", runs: [] });
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunBars, setSelectedRunBars] = useState([]);
  const [barsLoading, setBarsLoading] = useState(false);
  const [barsLoadError, setBarsLoadError] = useState("");
  const [compareRunAId, setCompareRunAId] = useState("");
  const [compareRunBId, setCompareRunBId] = useState("");
  const barsRequestId = useRef(0);
  const activeStrategyId = compareStrategyId ?? selectedStrategy?.id ?? strategies[0]?.id ?? "";
  const savedRuns = savedRunsState.strategyId === activeStrategyId ? savedRunsState.runs : [];

  useEffect(() => {
    if (!userId || !activeStrategyId) return undefined;

    const strategy = strategies.find((entry) => entry.id === activeStrategyId) || selectedStrategy;
    if (!strategy) return undefined;

    let active = true;

    async function loadSavedRuns() {
      const versionIds = (strategy.versions || []).map((version) => version.id).filter(Boolean);
      const { data, error } = versionIds.length
        ? await supabase
            .from("backtest_results")
            .select("*")
            .in("strategy_version_id", versionIds)
            .order("created_at", { ascending: false })
        : { data: [], error: null };

      if (error) {
        console.error("Could not load saved backtest results:", error);
        return;
      }

      if (!active) return;
      const nextRuns = (data || []).map(dbToBacktestResult);
      setSavedRunsState({ strategyId: activeStrategyId, runs: nextRuns });
      setSelectedRunId((current) => current && nextRuns.some((run) => run.id === current) ? current : nextRuns[0]?.id || "");
      setCompareRunAId((current) => current && nextRuns.some((run) => run.id === current) ? current : nextRuns[0]?.id || "");
      setCompareRunBId((current) => current && nextRuns.some((run) => run.id === current) ? current : nextRuns[1]?.id || "");
    }

    loadSavedRuns();
    return () => { active = false; };
  }, [activeStrategyId, selectedStrategy, strategies, userId]);

  async function openSavedRun(result) {
    const requestId = ++barsRequestId.current;
    setSelectedRunId(result.id);
    setSelectedRunBars([]);
    setBarsLoadError("");
    setBarsLoading(true);

    try {
      const bars = await fetchHistoricalBars(
        result.asset,
        result.timeframe,
        result.startDate,
        result.endDate,
      );
      if (!Array.isArray(bars) || bars.length === 0) {
        throw new Error("No historical bars were returned for this saved result.");
      }
      if (requestId === barsRequestId.current) setSelectedRunBars(bars);
    } catch (fetchError) {
      if (requestId === barsRequestId.current) {
        setBarsLoadError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      }
    } finally {
      if (requestId === barsRequestId.current) setBarsLoading(false);
    }
  }

  const selectedRun = savedRuns.find((run) => run.id === selectedRunId) || savedRuns[0] || null;
  const compareRunA = savedRuns.find((run) => run.id === compareRunAId) || savedRuns[0] || null;
  const compareRunB = savedRuns.find((run) => run.id === compareRunBId) || savedRuns[1] || null;

  return (
    <section className="strategy-lab-section">
      <div className="strategy-section-heading">
        <div>
          <p className="eyebrow">VERSION COMPARISON</p>
          <h2>Did the strategy improve?</h2>
          <p>Saved backtests are grouped by strategy version, with the most recent runs first.</p>
        </div>
      </div>

      <div className="version-compare-toolbar">
        <label>
          Strategy
          <select value={activeStrategyId} onChange={(event) => setCompareStrategyId(event.target.value)}>
            <option value="">Select strategy</option>
            {strategies.map((strategy) => (
              <option value={strategy.id} key={strategy.id}>{strategy.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!activeStrategyId || savedRuns.length === 0 ? (
        <EmptyEngineState
          title="No completed versions to compare"
          description="Run a backtest and it will save automatically here, then you can compare net P&L, win rate, profit factor, and trade count from earlier results."
        />
      ) : (
        <>
          <div className="version-compare-cards">
            {savedRuns.map((run) => (
              <button
                type="button"
                key={run.id}
                className={`version-compare-card${selectedRunId === run.id ? " selected" : ""}`}
                onClick={() => openSavedRun(run)}
              >
                <div className="version-compare-card-header">
                  <strong>{run.asset}</strong>
                  <span>{run.timeframe}</span>
                </div>
                <small>{run.session}</small>
                <small>{run.startDate} → {run.endDate}</small>
                <div className="version-compare-metrics">
                  <span>Net P&amp;L<strong>{formatCurrency(run.metrics?.netPnl ?? 0)}</strong></span>
                  <span>Win rate<strong>{formatMetric(run.metrics?.winRate ?? 0)}%</strong></span>
                  <span>Profit factor<strong>{formatMetric(run.metrics?.profitFactor ?? 0)}</strong></span>
                  <span>Trades<strong>{run.metrics?.totalTrades ?? run.trades?.length ?? 0}</strong></span>
                </div>
              </button>
            ))}
          </div>

          <div className="version-compare-compare-panel">
            <div className="version-compare-side-by-side">
              <label>
                Run A
                <select value={compareRunAId} onChange={(event) => setCompareRunAId(event.target.value)}>
                  <option value="">Select result</option>
                  {savedRuns.map((run) => (<option value={run.id} key={`a-${run.id}`}>{run.asset} · {run.startDate}</option>))}
                </select>
              </label>
              <label>
                Run B
                <select value={compareRunBId} onChange={(event) => setCompareRunBId(event.target.value)}>
                  <option value="">Select result</option>
                  {savedRuns.map((run) => (<option value={run.id} key={`b-${run.id}`}>{run.asset} · {run.startDate}</option>))}
                </select>
              </label>
            </div>

            {(compareRunA || compareRunB) && (
              <div className="version-compare-table-wrap">
                <table className="version-compare-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>{compareRunA ? `${compareRunA.asset} · ${compareRunA.startDate}` : "Run A"}</th>
                      <th>{compareRunB ? `${compareRunB.asset} · ${compareRunB.startDate}` : "Run B"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Net P&L", compareRunA?.metrics?.netPnl ?? 0, compareRunB?.metrics?.netPnl ?? 0],
                      ["Win rate", compareRunA?.metrics?.winRate ?? 0, compareRunB?.metrics?.winRate ?? 0],
                      ["Profit factor", compareRunA?.metrics?.profitFactor ?? 0, compareRunB?.metrics?.profitFactor ?? 0],
                      ["Trade count", compareRunA?.metrics?.totalTrades ?? compareRunA?.trades?.length ?? 0, compareRunB?.metrics?.totalTrades ?? compareRunB?.trades?.length ?? 0],
                    ].map(([label, left, right]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        <td>{label === "Net P&L" ? formatCurrency(left) : label === "Win rate" ? `${formatMetric(left)}%` : label === "Profit factor" ? formatMetric(left) : left}</td>
                        <td>{label === "Net P&L" ? formatCurrency(right) : label === "Win rate" ? `${formatMetric(right)}%` : label === "Profit factor" ? formatMetric(right) : right}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedRun && (
            <div className="version-compare-details">
              <div className="backtest-results-placeholder">
                <p className="eyebrow">SELECTED RUN</p>
                <h3>{selectedRun.asset} · {selectedRun.timeframe}</h3>
                <p className="backtest-result-caption">Result parameters: {selectedRun.asset} · {selectedRun.timeframe} · {selectedRun.session} · {selectedRun.startDate} to {selectedRun.endDate}</p>
                <div className="backtest-result-labels">
                  <span>Total trades<strong>{selectedRun.metrics?.totalTrades ?? selectedRun.trades?.length ?? 0}</strong></span>
                  <span>Win rate<strong>{formatMetric(selectedRun.metrics?.winRate ?? 0)}%</strong></span>
                  <span>Net P&amp;L<strong>{formatCurrency(selectedRun.metrics?.netPnl ?? 0)}</strong></span>
                  <span>Profit factor<strong>{formatMetric(selectedRun.metrics?.profitFactor ?? 0)}</strong></span>
                  <span>Max drawdown<strong>{formatCurrency(selectedRun.metrics?.maxDrawdown ?? 0)}</strong></span>
                  <span>Expectancy<strong>{formatCurrency(selectedRun.metrics?.expectancy ?? 0)}</strong></span>
                </div>
                {selectedRun.metrics?.equityCurve && (
                  <div className="backtest-equity-chart">
                    <p className="eyebrow">EQUITY CURVE</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={selectedRun.metrics.equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(150, 180, 205, 0.08)" />
                        <XAxis type="number" dataKey="timestamp" scale="time" domain={["dataMin", "dataMax"]} tickCount={6} minTickGap={24} tickFormatter={(value) => formatChartTimestamp(value, selectedRun.timeframe)} stroke="#7f94a8" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(value) => `$${Math.round(value)}`} stroke="#7f94a8" tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(value) => [formatCurrency(value), "Equity"]} labelFormatter={(value) => formatChartTimestamp(value, selectedRun.timeframe)} />
                        <Line type="monotone" dataKey="equity" stroke="#65c4c4" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <ExpandedMetrics result={selectedRun.metrics || {}} />
                {barsLoading && <p className="version-compare-bars-loading" role="status">Loading historical bars for the trade charts...</p>}
                {barsLoadError && (
                  <div className="version-compare-bars-error" role="alert">
                    <p className="strategy-error-message">Could not load historical bars: {barsLoadError}</p>
                    <button type="button" className="strategy-primary-action" onClick={() => openSavedRun(selectedRun)}>Retry bar load</button>
                  </div>
                )}
                <TradeLog trades={selectedRun.trades || []} bars={selectedRunBars || []} asset={selectedRun.asset} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function formatForwardValue(value, metricKey) {
  if (value === Number.POSITIVE_INFINITY) return "n/a";
  if (!Number.isFinite(value)) return "n/a";
  if (metricKey === "winRate") return `${value.toFixed(2)}%`;
  if (metricKey === "expectancy") return formatCurrency(value);
  if (metricKey === "averageRiskReward") return `${value.toFixed(2)}R`;
  return value.toFixed(2);
}

function ForwardTest({ strategies, selectedStrategy, trades, userId }) {
  const [strategyId, setStrategyId] = useState(selectedStrategy?.id || strategies[0]?.id || "");
  const [versionId, setVersionId] = useState("");
  const [savedRunsState, setSavedRunsState] = useState({ key: "", runs: [], error: "" });
  const activeStrategy = strategies.find((strategy) => strategy.id === strategyId) || strategies[0] || null;
  const activeVersion = activeStrategy?.versions.find((version) => version.id === versionId)
    || activeStrategy?.versions[0]
    || null;
  const savedRunsKey = userId && activeStrategy ? `${userId}:${activeStrategy.id}` : "";
  const hasLoadedSavedRuns = savedRunsState.key === savedRunsKey;
  const savedRuns = hasLoadedSavedRuns ? savedRunsState.runs : [];
  const isLoadingRuns = Boolean(savedRunsKey) && !hasLoadedSavedRuns;
  const runsError = hasLoadedSavedRuns ? savedRunsState.error : "";

  useEffect(() => {
    if (!userId || !activeStrategy) return undefined;

    let active = true;
    const versionIds = activeStrategy.versions.map((version) => version.id).filter(Boolean);
    const key = `${userId}:${activeStrategy.id}`;

    async function loadSavedRuns() {
      const { data, error } = versionIds.length
        ? await supabase
            .from("backtest_results")
            .select("*")
            .in("strategy_version_id", versionIds)
            .order("created_at", { ascending: false })
        : await Promise.resolve({ data: [], error: null });

      if (!active) return;
      setSavedRunsState({
        key,
        runs: error ? [] : (data || []).map(dbToBacktestResult),
        error: error ? "Could not load saved backtests for this strategy." : "",
      });
    }

    loadSavedRuns();
    return () => { active = false; };
  }, [activeStrategy, userId]);

  const versionTrades = activeVersion
    ? trades.filter((trade) => trade.strategyVersionId === activeVersion.id)
    : [];
  const stats = computeForwardStats(versionTrades);
  const adherence = computeAdherence(versionTrades, activeVersion);
  const savedBacktest = savedRuns.find((run) => run.strategyVersionId === activeVersion?.id) || null;
  const comparison = compareForwardToBacktest(stats, savedBacktest);
  const statItems = [
    ["Trades", stats.tradeCount],
    ["Wins / losses", `${stats.wins} / ${stats.losses}`],
    ["Win rate", formatForwardValue(stats.winRate, "winRate")],
    ["Net P&L", formatCurrency(stats.netPnl)],
    ["Profit factor", formatForwardValue(stats.profitFactor, "profitFactor")],
    ["Expectancy", formatCurrency(stats.expectancy)],
    ["Average win", formatCurrency(stats.averageWin)],
    ["Average loss", formatCurrency(stats.averageLoss)],
    ["Largest win", formatCurrency(stats.largestWin)],
    ["Largest loss", formatCurrency(stats.largestLoss)],
    ["Max consecutive losses", stats.maxConsecutiveLosses],
    ["Max drawdown", formatCurrency(stats.maxDrawdownUsd)],
    ["Average R:R", formatForwardValue(stats.averageRiskReward, "averageRiskReward")],
  ];

  return (
    <section className="strategy-lab-section forward-test-section">
      <div className="strategy-section-heading">
        <div>
          <p className="eyebrow">JOURNALED PERFORMANCE</p>
          <h2>Forward Test</h2>
          <p>Journal results and recorded setup conditions, grouped by the exact strategy version used.</p>
        </div>
      </div>

      <div className="forward-test-toolbar">
        <label>Strategy<select value={activeStrategy?.id || ""} onChange={(event) => {
          setStrategyId(event.target.value);
          setVersionId("");
        }}>
          <option value="">Select strategy</option>
          {strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}
        </select></label>
        <label>Strategy version<select value={activeVersion?.id || ""} onChange={(event) => setVersionId(event.target.value)} disabled={!activeStrategy}>
          <option value="">Select version</option>
          {(activeStrategy?.versions || []).map((version) => <option value={version.id} key={version.id}>v{version.version}</option>)}
        </select></label>
      </div>

      {stats.tradeCount < 30 && <p className="forward-test-significance">Not statistically meaningful yet, aim for 100+.</p>}
      {runsError && <p className="strategy-error-message" role="alert">{runsError}</p>}
      {!runsError && !isLoadingRuns && activeVersion && !savedBacktest && <p className="forward-test-no-backtest">No backtest saved for this version</p>}
      {!activeStrategy || !activeVersion ? (
        <EmptyEngineState title="No strategy versions available" description="Create a strategy version before journal trades can be grouped into a forward test." />
      ) : stats.tradeCount === 0 ? (
        <EmptyEngineState title="No journaled trades for this version" description={`Trades linked to ${activeStrategy.name} v${activeVersion.version} will appear here after they are saved.`} />
      ) : (
        <>
          <div className="forward-test-stat-grid">
            {statItems.map(([label, value]) => <div className="forward-test-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>

          <section className="forward-test-panel">
            <p className="eyebrow">CUMULATIVE JOURNAL P&amp;L</p>
            <div className="backtest-equity-chart">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={stats.equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(150, 180, 205, 0.08)" />
                  <XAxis dataKey="tradeNumber" stroke="#7f94a8" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(value) => `$${Math.round(value)}`} stroke="#7f94a8" tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => [formatCurrency(value), "Cumulative P&L"]} labelFormatter={(value) => `Trade ${value}`} />
                  <Line type="monotone" dataKey="cumulativePnl" stroke="#65c4c4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="forward-test-panel">
            <p className="eyebrow">DECLARED CONDITION ADHERENCE</p>
            {adherence.conditions.length ? <div className="forward-test-adherence-list">
              {adherence.conditions.map((condition) => <div className="forward-test-adherence-row" key={condition.key}>
                <span>{condition.label}</span>
                <div className="forward-test-adherence-track" role="progressbar" aria-label={`${condition.label} checked`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={condition.percentage}><span style={{ width: `${condition.percentage}%` }} /></div>
                <strong>{condition.percentage.toFixed(0)}%</strong>
              </div>)}
              <p className="forward-test-adherence-summary">All declared conditions present: {adherence.fullyAdherentCount} / {adherence.tradeCount} ({adherence.fullyAdherentPercentage.toFixed(0)}%)</p>
            </div> : <p className="forward-test-muted">No conditions were declared for this version.</p>}
            <div className="forward-test-missing-list">
              <h3>Trades missing conditions or marked as rule breaks</h3>
              {adherence.missingTrades.length ? <ul>{adherence.missingTrades.map((trade) => <li key={trade.id}>
                <strong>{trade.asset || "Trade"}</strong><span>{[trade.date, trade.time].filter(Boolean).join(" ") || "Date not recorded"}</span>
                <span>{trade.missingConditions.length ? `Missing: ${trade.missingConditions.join(", ")}` : "All declared conditions present"}</span>
                {trade.ruleBreak && <em>Rule break</em>}
              </li>)}</ul> : <p className="forward-test-muted">No missing conditions or rule breaks recorded.</p>}
            </div>
          </section>

          <section className="forward-test-panel">
            <p className="eyebrow">FORWARD VS BACKTEST</p>
            {isLoadingRuns ? <p className="forward-test-muted">Loading saved backtests...</p> : savedBacktest && comparison ? <div className="version-compare-table-wrap">
              <table className="version-compare-table">
                <thead><tr><th>Metric</th><th>Forward</th><th>Backtest</th><th>Delta</th></tr></thead>
                <tbody>{comparison.map((metric) => <tr key={metric.key}>
                  <td>{metric.label}</td>
                  <td>{formatForwardValue(metric.forward, metric.key)}</td>
                  <td>{formatForwardValue(metric.backtest, metric.key)}</td>
                  <td>{metric.delta === null ? "n/a" : `${metric.delta > 0 ? "+" : ""}${formatForwardValue(metric.delta, metric.key)}`}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="forward-test-muted">A saved backtest is needed to compare these metrics.</p>}
          </section>
        </>
      )}
    </section>
  );
}

function StrategyLab({ initialView = "library", userId, trades = [], onStrategiesChange }) {
  const [view, setView] = useState(initialView);
  const [strategies, setStrategies] = useState([]);
  const [draft, setDraft] = useState(createStrategyDraft());
  const [request, setRequest] = useState(createBacktestRequest());
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadStrategies() {
      try {
        const nextStrategies = await fetchStrategyLibrary(userId);
        if (!active) return;
        setStrategies(nextStrategies);
        onStrategiesChange?.(nextStrategies);
      } catch (error) {
        console.error("Could not load strategy library:", error);
      }
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
      {view === "backtesting" && <BacktestWorkspace strategies={strategies} request={request} setRequest={setRequest} userId={userId} />}
      {view === "compare" && <VersionCompare strategies={strategies} selectedStrategy={selectedStrategy} userId={userId} />}
      {view === "forward-test" && <ForwardTest strategies={strategies} selectedStrategy={selectedStrategy} trades={trades} userId={userId} />}
    </div>
  );
}

export default StrategyLab;
