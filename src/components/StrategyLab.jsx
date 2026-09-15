import { useState } from "react";
import {
  createBacktestRequest,
  createStrategyDraft,
  createStrategyVersion,
  strategyConditionCatalog,
  strategyStatuses,
} from "../services/strategyModels";
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

function BacktestWorkspace({ strategies, request, setRequest }) {
  const selectedStrategy = strategies.find((strategy) => strategy.id === request.strategyId);
  const versions = selectedStrategy?.versions || [];
  const update = (field, value) => setRequest((previous) => ({ ...previous, [field]: value }));
  return (
    <section className="strategy-lab-section backtest-section">
      <div className="strategy-section-heading"><div><p className="eyebrow">BACKTESTING INTERFACE</p><h2>Test a strategy version</h2><p>Define the historical test request now. Results remain unavailable until a real OHLC data source and execution engine are connected.</p></div><span className="strategy-data-status">No historical data</span></div>
      <div className="backtest-request-grid"><label>Strategy<select value={request.strategyId} onChange={(event) => update("strategyId", event.target.value)}><option value="">Select strategy</option>{strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select></label><label>Strategy version<select value={request.versionId} onChange={(event) => update("versionId", event.target.value)} disabled={!selectedStrategy}><option value="">Select version</option>{versions.map((version) => <option value={version.id} key={version.id}>v{version.version}</option>)}</select></label><label>Asset<input value={request.asset} onChange={(event) => update("asset", event.target.value)} placeholder="Symbol" /></label><label>Timeframe<input value={request.timeframe} onChange={(event) => update("timeframe", event.target.value)} placeholder="15m" /></label><label>Start date<input type="date" value={request.startDate} onChange={(event) => update("startDate", event.target.value)} /></label><label>End date<input type="date" value={request.endDate} onChange={(event) => update("endDate", event.target.value)} /></label><label>Session<input value={request.session} onChange={(event) => update("session", event.target.value)} placeholder="All sessions" /></label><label>Risk per trade<input value={request.riskPerTrade} onChange={(event) => update("riskPerTrade", event.target.value)} placeholder="e.g. 1%" /></label><label>Starting balance<input value={request.startingBalance} onChange={(event) => update("startingBalance", event.target.value)} placeholder="e.g. 10000" /></label></div>
      <div className="backtest-action-row"><button type="button" className="strategy-primary-action" disabled>Run backtest</button><span>Backtesting is unavailable until historical market data is connected.</span></div>
      <div className="backtest-results-placeholder"><p className="eyebrow">RESULTS ARCHITECTURE</p><h3>Results will appear here</h3><div className="backtest-result-labels"><span>Total trades</span><span>Win rate</span><span>Net P&amp;L</span><span>Profit factor</span><span>Max drawdown</span><span>Expectancy</span></div><small>No simulated or fabricated results are shown.</small></div>
    </section>
  );
}

function StrategyLab({ initialView = "library", strategies: initialStrategies = [], onStrategiesChange }) {
  const [view, setView] = useState(initialView);
  const [strategies, setStrategies] = useState(initialStrategies);
  const [draft, setDraft] = useState(createStrategyDraft());
  const [request, setRequest] = useState(createBacktestRequest());
  const [selectedStrategy, setSelectedStrategy] = useState(null);

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

  function saveVersion() {
    if (!draft.name.trim()) return;
    const existing = strategies.find((strategy) => strategy.name === draft.name.trim());
    const nextVersion = existing ? existing.versions.length + 1 : 1;
    const version = createStrategyVersion({ ...draft, name: draft.name.trim() }, nextVersion);
    const strategy = existing ? { ...existing, ...draft, name: draft.name.trim(), versions: [...existing.versions, version] } : { ...draft, name: draft.name.trim(), id: version.id.split("-v")[0], versions: [version] };
    const nextStrategies = existing ? strategies.map((item) => item.id === existing.id ? strategy : item) : [...strategies, strategy];
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
