import { useEffect, useState } from "react";
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
import { runBacktest, smaCrossover } from "../services/backtestEngine";
import { fetchHistoricalBars } from "../services/historicalDataService";
import "./StrategyLab.css";

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

function parseRiskPerTrade(value) {
  const normalized = String(value).trim();
  const hasPercentSign = normalized.endsWith("%");
  const numericValue = Number(hasPercentSign ? normalized.slice(0, -1).trim() : normalized);
  const riskPerTrade = hasPercentSign || numericValue > 1 ? numericValue / 100 : numericValue;
  if (!Number.isFinite(riskPerTrade) || riskPerTrade <= 0 || riskPerTrade > 1) {
    throw new Error("Risk per trade must be a number greater than 0 and no more than 100%.");
  }
  return riskPerTrade;
}

function parseStartingBalance(value) {
  const startingBalance = Number(String(value).trim());
  if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
    throw new Error("Starting balance must be a number greater than zero.");
  }
  return startingBalance;
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

function formatChartTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function BacktestWorkspace({ strategies, request, setRequest }) {
  const [bars, setBars] = useState(null);
  const [backtestResult, setBacktestResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedStrategy = strategies.find((strategy) => strategy.id === request.strategyId);
  const versions = selectedStrategy?.versions || [];
  const update = (field, value) => setRequest((previous) => ({ ...previous, [field]: value }));

  async function runBacktest() {
    setIsLoading(true);
    setError("");
    try {
      const riskPerTrade = parseRiskPerTrade(request.riskPerTrade);
      const startingBalance = parseStartingBalance(request.startingBalance);
      const fetchedBars = await fetchHistoricalBars(request.asset, request.timeframe, request.startDate, request.endDate);
      if (fetchedBars.length < 22) {
        throw new Error("At least 22 historical bars are required for the SMA crossover backtest.");
      }
      const result = runBacktest({
        bars: fetchedBars,
        entryRule: smaCrossover(5, 20),
        stopLossPct: 0.02,
        takeProfitPct: 0.04,
        riskPerTrade,
        startingBalance,
        direction: "long",
      });
      setBars(fetchedBars);
      setBacktestResult(result);
    } catch (fetchError) {
      setBars(null);
      setBacktestResult(null);
      setError(fetchError.message);
    } finally {
      setIsLoading(false);
    }
  }

  const status = bars
    ? `${bars.length} bars loaded: ${request.startDate} to ${request.endDate}`
    : "No historical data";
  return (
    <section className="strategy-lab-section backtest-section">
      <div className="strategy-section-heading"><div><p className="eyebrow">BACKTESTING INTERFACE</p><h2>Test a strategy version</h2><p>Run a deterministic test over real historical bars. This preview uses a placeholder SMA crossover entry rule while strategy-condition detection is still being built.</p></div><span className="strategy-data-status">{status}</span></div>
      <div className="backtest-request-grid"><label>Strategy<select value={request.strategyId} onChange={(event) => update("strategyId", event.target.value)}><option value="">Select strategy</option>{strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select></label><label>Strategy version<select value={request.versionId} onChange={(event) => update("versionId", event.target.value)} disabled={!selectedStrategy}><option value="">Select version</option>{versions.map((version) => <option value={version.id} key={version.id}>v{version.version}</option>)}</select></label><label>Asset<input value={request.asset} onChange={(event) => update("asset", event.target.value)} placeholder="Symbol" /></label><label>Timeframe<input value={request.timeframe} onChange={(event) => update("timeframe", event.target.value)} placeholder="15m" /></label><label>Start date<input type="date" value={request.startDate} onChange={(event) => update("startDate", event.target.value)} /></label><label>End date<input type="date" value={request.endDate} onChange={(event) => update("endDate", event.target.value)} /></label><label>Session<input value={request.session} onChange={(event) => update("session", event.target.value)} placeholder="All sessions" /></label><label>Risk per trade<input value={request.riskPerTrade} onChange={(event) => update("riskPerTrade", event.target.value)} placeholder="e.g. 1%" /></label><label>Starting balance<input value={request.startingBalance} onChange={(event) => update("startingBalance", event.target.value)} placeholder="e.g. 10000" /></label></div>
      <div className="backtest-action-row"><button type="button" className="strategy-primary-action" onClick={runBacktest} disabled={isLoading}>{isLoading ? "Running backtest..." : "Run backtest"}</button><span>Uses real historical bars and the placeholder SMA crossover engine.</span></div>
      {error && <p role="alert" className="strategy-error-message">{error}</p>}
      <div className="backtest-results-placeholder"><p className="eyebrow">BACKTEST RESULTS</p><h3>{backtestResult ? "Execution summary" : "Results will appear here"}</h3>{backtestResult ? <><div className="backtest-result-labels"><span>Total trades<strong>{backtestResult.totalTrades}</strong></span><span>Win rate<strong>{formatMetric(backtestResult.winRate)}%</strong></span><span>Net P&amp;L<strong>{formatCurrency(backtestResult.netPnl)}</strong></span><span>Profit factor<strong>{formatMetric(backtestResult.profitFactor)}</strong></span><span>Max drawdown<strong>{formatCurrency(backtestResult.maxDrawdown)}</strong></span><span>Expectancy<strong>{formatCurrency(backtestResult.expectancy)}</strong></span></div><p className="backtest-disclaimer">These results use a placeholder SMA crossover entry rule (5/20), not the selected strategy&apos;s declared MSS, FVG, order-block, liquidity-sweep, or other conditions. Those detectors are not implemented yet.</p><div className="backtest-equity-chart"><p className="eyebrow">EQUITY CURVE</p><ResponsiveContainer width="100%" height={240}><LineChart data={backtestResult.equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(150, 180, 205, 0.14)" /><XAxis dataKey="timestamp" tickFormatter={formatChartTimestamp} stroke="#7f94a8" tick={{ fontSize: 10 }} /><YAxis tickFormatter={(value) => `$${Math.round(value)}`} stroke="#7f94a8" tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => [formatCurrency(value), "Equity"]} labelFormatter={formatChartTimestamp} /><Line type="monotone" dataKey="equity" stroke="#65c4c4" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></> : <small>Run a test to calculate metrics from the fetched historical bars.</small>}</div>
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
