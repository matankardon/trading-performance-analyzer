import { Fragment, useState } from "react";
import {
  createBacktestRequest,
  createStrategyDraft,
  createStrategyVersion,
  normalizeStrategy,
  strategyDirections,
  strategyStatuses,
} from "../services/strategyModels";
import DataSourceMeta from "./DataSourceMeta";
import "./StrategyLab.css";

const tabs = [
  ["library", "Strategy Library"],
  ["builder", "Strategy Builder"],
  ["backtesting", "Backtesting"],
  ["compare", "Version Compare"],
];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "--";
}

function LabHeader({ view, onViewChange }) {
  return (
    <header className="strategy-lab-header">
      <div>
        <p className="eyebrow">STRATEGY DEVELOPMENT</p>
        <h1>Strategy Lab</h1>
        <p>Define, version, and prepare trading rules for a real test when market data is connected.</p>
      </div>
      <nav className="strategy-lab-tabs" aria-label="Strategy Lab views">
        {tabs.map(([key, label]) => <button className={view === key ? "active" : ""} type="button" onClick={() => onViewChange(key)} key={key}>{label}</button>)}
      </nav>
    </header>
  );
}

function EmptyEngineState({ title, description, action }) {
  return <div className="strategy-engine-empty"><span className="strategy-empty-mark" aria-hidden="true">--</span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function StrategyLibrary({ strategies, onCreate, onSelect }) {
  return (
    <section className="strategy-lab-section strategy-library-section">
      <div className="strategy-section-heading"><div><p className="eyebrow">STRATEGY LIBRARY</p><h2>Methods under development</h2><p>Keep each methodology and its configurations separate from executed trades.</p></div><button className="strategy-primary-action" type="button" onClick={onCreate}>Create strategy</button></div>
      {strategies.length === 0 ? <EmptyEngineState title="Create your first strategy" description="Start with a clear market idea, then define the conditions, exits, risk rules, and notes that make it testable." action={<button className="strategy-secondary-action" type="button" onClick={onCreate}>Create strategy</button>} /> : <div className="strategy-library-table" role="table" aria-label="Saved strategies"><div className="strategy-library-table-head" role="row"><span>Strategy</span><span>Market context</span><span>Version</span><span>Status</span><span>Updated</span><span /></div>{strategies.map((strategy) => <StrategyRow key={strategy.id} strategy={strategy} onSelect={onSelect} />)}</div>}
    </section>
  );
}

function StrategyRow({ strategy, onSelect }) {
  const version = strategy.versions.find((item) => item.version === strategy.currentVersion) || strategy.versions.at(-1);
  return <button type="button" className="strategy-library-row" onClick={() => onSelect(strategy)}><span className="strategy-library-main"><strong>{strategy.name}</strong><small>{strategy.description || "No description yet"}</small></span><span><strong>{strategy.asset || "--"}</strong><small>{strategy.timeframe || "Timeframe pending"} / {strategy.session || "Session pending"}</small></span><span className="strategy-version-value">v{strategy.currentVersion || version?.version || 1}<small>{strategy.versions.length} saved version{strategy.versions.length === 1 ? "" : "s"}</small></span><span><span className={`strategy-status-badge status-${strategy.status.toLowerCase()}`}>{strategy.status}</span></span><span className="strategy-updated">{formatDate(strategy.updatedAt || version?.createdAt)}</span><span className="strategy-open-arrow" aria-hidden="true">-&gt;</span></button>;
}

function ConditionList({ conditions }) {
  const enabled = conditions.filter((condition) => condition.enabled);
  if (!enabled.length) return <p className="strategy-muted-copy">No entry conditions defined yet.</p>;
  return <div className="strategy-detail-condition-list">{enabled.map((condition) => <div className="strategy-detail-condition" key={condition.key}><span className="condition-marker" aria-hidden="true">+</span><div><strong>{condition.label}</strong><small>{condition.required ? "Required condition" : "Optional confirmation"}</small></div>{condition.notes && <p>{condition.notes}</p>}</div>)}</div>;
}

function StrategyDetail({ strategy, onBack, onEdit, onNewVersion, onBacktest }) {
  const current = strategy.versions.find((version) => version.version === strategy.currentVersion) || strategy.versions.at(-1);
  const required = current.conditions.filter((condition) => condition.enabled && condition.required);
  const optional = current.conditions.filter((condition) => condition.enabled && !condition.required);
  return <section className="strategy-lab-section strategy-detail-section"><button className="strategy-back-link" type="button" onClick={onBack}>&lt;- Strategy Library</button><div className="strategy-detail-header"><div><p className="eyebrow">STRATEGY WORKSPACE</p><h2>{strategy.name}</h2><p>{strategy.description || "No description yet"}</p></div><div className="strategy-detail-actions"><span className={`strategy-status-badge status-${strategy.status.toLowerCase()}`}>{strategy.status}</span><button className="strategy-secondary-action" type="button" onClick={onEdit}>Edit current version</button><button className="strategy-primary-action" type="button" onClick={onNewVersion}>Create new version</button></div></div><div className="strategy-detail-meta"><span><small>Asset</small><strong>{strategy.asset || strategy.assets || "--"}</strong></span><span><small>Timeframe</small><strong>{strategy.timeframe || "--"}</strong></span><span><small>Session</small><strong>{strategy.session || "--"}</strong></span><span><small>Direction</small><strong>{strategy.direction || "--"}</strong></span><span><small>Current version</small><strong>v{current.version}</strong></span></div><div className="strategy-detail-grid"><div className="strategy-detail-column"><DetailPanel title="Strategy logic" marker={`VERSION v${current.version}`}><h3>Entry conditions</h3><ConditionList conditions={current.conditions} /><div className="strategy-condition-summary"><span>Required {required.length}</span><span>Optional {optional.length}</span></div><h3>Exit rules</h3><DetailList items={[["Exit condition", current.exitCondition || current.exitRules], ["Time-based exit", current.timeBasedExit]]} /></DetailPanel><DetailPanel title="Risk management" marker={`VERSION v${current.version}`}><DetailList items={[["Stop loss", current.stopLossRules], ["Take profit", current.takeProfitRules], ["Risk / reward", current.riskReward], ["Risk per trade", current.riskPerTrade], ["Session limits", current.maxTradesPerSession]]} /></DetailPanel></div><div className="strategy-detail-column"><DetailPanel title="Version history" marker={`${strategy.versions.length} CONFIGURATION${strategy.versions.length === 1 ? "" : "S"}`}><div className="strategy-version-list">{[...strategy.versions].reverse().map((version) => <div className={`strategy-version-row ${version.version === current.version ? "active" : ""}`} key={version.id}><span><strong>v{version.version}</strong><small>{version.version === current.version ? "Current version" : "Previous configuration"}</small></span><span>{formatDate(version.createdAt)}</span><span>{version.status}</span></div>)}</div></DetailPanel><DetailPanel title="Backtest" marker="ENGINE STATUS"><h3>Prepare a historical test</h3><p>Results are unavailable until a real market-data source and execution engine are connected.</p><button className="strategy-secondary-action" type="button" onClick={onBacktest}>Open backtest setup</button></DetailPanel><DetailPanel title="Performance" marker="NO RESULTS"><p>No backtest results yet.</p><p>No strategy insights yet.</p></DetailPanel></div></div><div className="strategy-notes-panel"><div className="strategy-panel-title"><span>Strategy notes</span><small>VERSION v{current.version}</small></div><p>{current.notes || "No observations or things to avoid have been recorded yet."}</p></div></section>;
}

function DetailPanel({ title, marker, children }) { return <div className="strategy-detail-panel"><div className="strategy-panel-title"><span>{title}</span><small>{marker}</small></div>{children}</div>; }
function DetailList({ items }) { return <dl className="strategy-detail-list">{items.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value || "Not defined"}</dd></Fragment>)}</dl>; }
function BuilderGroup({ title, children }) { return <div className="strategy-builder-group"><span className="strategy-group-label">{title}</span>{children}</div>; }

function StrategyBuilder({ draft, setDraft, onSave, selectedStrategy }) {
  const update = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
  const updateCondition = (key, field, value) => setDraft((previous) => ({ ...previous, conditions: previous.conditions.map((condition) => condition.key === key ? { ...condition, [field]: value } : condition) }));
  return <section className="strategy-lab-section strategy-builder-section"><div className="strategy-section-heading"><div><p className="eyebrow">STRATEGY BUILDER</p><h2>{selectedStrategy ? "Create a new version" : "Define a strategy"}</h2><p>{selectedStrategy ? `Version ${selectedStrategy.currentVersion + 1} will preserve the existing configuration.` : "Build a strategy in clear, testable sections."}</p></div><span className="strategy-data-status">Unsaved draft</span></div><div className="strategy-builder-grid"><div className="strategy-builder-column"><BuilderGroup title="Strategy overview"><label>Strategy name<input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. NY Liquidity Reversal" /></label><label>Description<textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="What market behavior does this methodology target?" rows="3" /></label><div className="strategy-two-fields"><label>Asset<input value={draft.asset || draft.assets} onChange={(event) => { update("asset", event.target.value); update("assets", event.target.value); }} placeholder="e.g. XAUUSD" /></label><label>Timeframe<input value={draft.timeframe} onChange={(event) => update("timeframe", event.target.value)} placeholder="e.g. 5m" /></label></div><div className="strategy-two-fields"><label>Session<input value={draft.session} onChange={(event) => update("session", event.target.value)} placeholder="e.g. New York" /></label><label>Direction<select value={draft.direction} onChange={(event) => update("direction", event.target.value)}><option value="">Select direction</option>{strategyDirections.map((direction) => <option key={direction}>{direction}</option>)}</select></label></div><label>Status<select value={draft.status} onChange={(event) => update("status", event.target.value)}>{strategyStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></BuilderGroup><BuilderGroup title="Entry conditions"><p className="strategy-builder-help">Choose conditions for this version. Each condition remains structured for future backtest and Pine Script adapters.</p><div className="strategy-condition-builder">{draft.conditions.map((condition) => <div className={`strategy-condition-edit ${condition.enabled ? "selected" : ""}`} key={condition.key}><label className="condition-toggle"><input type="checkbox" checked={condition.enabled} onChange={(event) => updateCondition(condition.key, "enabled", event.target.checked)} /><span>{condition.label}</span></label>{condition.enabled && <div className="condition-options"><label><input type="radio" name={`${condition.key}-requirement`} checked={condition.required} onChange={() => updateCondition(condition.key, "required", true)} />Required</label><label><input type="radio" name={`${condition.key}-requirement`} checked={!condition.required} onChange={() => updateCondition(condition.key, "required", false)} />Optional</label><input value={condition.notes} onChange={(event) => updateCondition(condition.key, "notes", event.target.value)} placeholder="Condition notes" /></div>}</div>)}</div></BuilderGroup></div><div className="strategy-builder-column"><BuilderGroup title="Exit rules"><label>Exit condition<textarea value={draft.exitCondition} onChange={(event) => update("exitCondition", event.target.value)} placeholder="What confirms the trade should close?" rows="3" /></label><label>Time-based exit<input value={draft.timeBasedExit} onChange={(event) => update("timeBasedExit", event.target.value)} placeholder="e.g. Close before session end" /></label><label>Exit notes<textarea value={draft.exitRules} onChange={(event) => update("exitRules", event.target.value)} placeholder="Additional invalidation or exit detail" rows="3" /></label></BuilderGroup><BuilderGroup title="Risk management"><div className="strategy-two-fields"><label>Risk per trade<input value={draft.riskPerTrade || ""} onChange={(event) => update("riskPerTrade", event.target.value)} placeholder="e.g. 1%" /></label><label>Risk / reward<input value={draft.riskReward} onChange={(event) => update("riskReward", event.target.value)} placeholder="e.g. 2R" /></label></div><label>Stop loss<textarea value={draft.stopLossRules} onChange={(event) => update("stopLossRules", event.target.value)} placeholder="Where is the trade invalidated?" rows="3" /></label><label>Take profit<textarea value={draft.takeProfitRules} onChange={(event) => update("takeProfitRules", event.target.value)} placeholder="How is the target selected?" rows="3" /></label><div className="strategy-two-fields"><label>Max trades / session<input value={draft.maxTradesPerSession || ""} onChange={(event) => update("maxTradesPerSession", event.target.value)} placeholder="Optional" /></label><label>Max daily loss<input value={draft.maxDailyLoss || ""} onChange={(event) => update("maxDailyLoss", event.target.value)} placeholder="Optional" /></label></div></BuilderGroup><BuilderGroup title="Strategy notes"><label>Explanation and observations<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="What should be reviewed after a test? What should be avoided?" rows="6" /></label></BuilderGroup></div></div><div className="strategy-builder-footer"><button className="strategy-secondary-action" type="button" onClick={() => setDraft(createStrategyDraft())}>Clear draft</button><button className="strategy-primary-action" type="button" onClick={onSave} disabled={!draft.name.trim()}>Save strategy version</button></div></section>;
}

function BacktestWorkspace({ strategies, request, setRequest }) {
  const selectedStrategy = strategies.find((strategy) => strategy.id === request.strategyId);
  const update = (field, value) => setRequest((previous) => ({ ...previous, [field]: value, ...(field === "strategyId" ? { versionId: "" } : {}) }));
  return <section className="strategy-lab-section backtest-section"><div className="strategy-section-heading"><div><p className="eyebrow">BACKTESTING INTERFACE</p><h2>Prepare a strategy version</h2><p>Set up the request now. Historical results remain unavailable until a real OHLC data source and execution engine are connected.</p><DataSourceMeta metadata={{ dataStatus: "UNAVAILABLE" }} /></div><span className="strategy-data-status">No historical data</span></div><div className="backtest-request-grid"><label>Strategy<select value={request.strategyId} onChange={(event) => update("strategyId", event.target.value)}><option value="">Select strategy</option>{strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select></label><label>Strategy version<select value={request.versionId} onChange={(event) => update("versionId", event.target.value)} disabled={!selectedStrategy}><option value="">Select version</option>{selectedStrategy?.versions.map((version) => <option value={version.id} key={version.id}>v{version.version}</option>)}</select></label><label>Asset<input value={request.asset} onChange={(event) => update("asset", event.target.value)} placeholder="Symbol" /></label><label>Timeframe<input value={request.timeframe} onChange={(event) => update("timeframe", event.target.value)} placeholder="15m" /></label><label>Start date<input type="date" value={request.startDate} onChange={(event) => update("startDate", event.target.value)} /></label><label>End date<input type="date" value={request.endDate} onChange={(event) => update("endDate", event.target.value)} /></label><label>Session<input value={request.session} onChange={(event) => update("session", event.target.value)} placeholder="All sessions" /></label><label>Risk per trade<input value={request.riskPerTrade} onChange={(event) => update("riskPerTrade", event.target.value)} placeholder="e.g. 1%" /></label><label>Starting balance<input value={request.startingBalance} onChange={(event) => update("startingBalance", event.target.value)} placeholder="e.g. 10000" /></label></div><div className="backtest-action-row"><button type="button" className="strategy-primary-action" disabled>Run backtest</button><span>Historical market-data testing will be available once a market-data source is connected.</span></div><div className="backtest-results-placeholder"><p className="eyebrow">RESULTS ARCHITECTURE</p><h3>Results will appear here</h3><div className="backtest-result-labels"><span>Total trades</span><span>Win rate</span><span>Net P&amp;L</span><span>Profit factor</span><span>Max drawdown</span><span>Expectancy</span></div><small>No simulated or fabricated results are shown.</small></div></section>;
}

function VersionCompare({ strategies }) {
  const [strategyId, setStrategyId] = useState(strategies[0]?.id || "");
  const strategy = strategies.find((item) => item.id === strategyId);
  return <section className="strategy-lab-section"><div className="strategy-section-heading"><div><p className="eyebrow">VERSION COMPARISON</p><h2>Compare configurations</h2><p>Measured values will populate here after real backtest runs exist.</p></div><label className="compare-select">Strategy<select value={strategyId} onChange={(event) => setStrategyId(event.target.value)}><option value="">Select strategy</option>{strategies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>{!strategy ? <EmptyEngineState title="No strategy selected" description="Create a strategy with more than one version to prepare a comparison." /> : <div className="compare-workspace"><div className="compare-version-picker">{strategy.versions.map((version) => <span key={version.id}>v{version.version}</span>)}</div><div className="compare-metrics"><div><span>Win rate</span><strong>Not tested</strong></div><div><span>Profit factor</span><strong>Not tested</strong></div><div><span>Net P&amp;L</span><strong>Not tested</strong></div><div><span>Backtest status</span><strong>Not available yet</strong></div></div></div>}</section>;
}

function StrategyLab({ initialView = "library", strategies: initialStrategies = [], onStrategiesChange }) {
  const [view, setView] = useState(initialView);
  const strategies = initialStrategies.map(normalizeStrategy);
  const [draft, setDraft] = useState(createStrategyDraft());
  const [request, setRequest] = useState(createBacktestRequest());
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  function updateStrategies(nextStrategies) { onStrategiesChange?.(nextStrategies); }
  function createStrategy() { setSelectedStrategy(null); setDraft(createStrategyDraft()); setView("builder"); }
  function selectStrategy(strategy) { setSelectedStrategy(strategy); setView("detail"); }
  function editStrategy(strategy = selectedStrategy) { const current = strategy.versions.find((version) => version.version === strategy.currentVersion) || strategy.versions.at(-1); setDraft(createStrategyDraft(current)); setSelectedStrategy(strategy); setView("builder"); }
  function saveVersion() {
    if (!draft.name.trim()) return;
    const existing = selectedStrategy || strategies.find((strategy) => strategy.name.toLowerCase() === draft.name.trim().toLowerCase());
    const nextVersionNumber = existing ? Math.max(...existing.versions.map((version) => version.version), 0) + 1 : 1;
    const version = createStrategyVersion({ ...draft, name: draft.name.trim() }, nextVersionNumber);
    const strategy = normalizeStrategy(existing ? { ...existing, ...draft, name: draft.name.trim(), versions: [...existing.versions, version], currentVersion: nextVersionNumber, updatedAt: version.createdAt } : { ...draft, name: draft.name.trim(), id: `strategy-${Date.now()}`, versions: [version], currentVersion: 1, updatedAt: version.createdAt });
    updateStrategies(existing ? strategies.map((item) => item.id === existing.id ? strategy : item) : [...strategies, strategy]);
    setSelectedStrategy(strategy);
    setView("detail");
  }
  function openBacktest(strategy = selectedStrategy) { if (strategy) setRequest((previous) => ({ ...previous, strategyId: strategy.id, versionId: strategy.versions.at(-1)?.id || "", asset: strategy.asset, timeframe: strategy.timeframe, session: strategy.session })); setView("backtesting"); }

  return <div className="strategy-lab-page"><LabHeader view={view} onViewChange={setView} />{view === "library" && <StrategyLibrary strategies={strategies} onCreate={createStrategy} onSelect={selectStrategy} />}{view === "detail" && selectedStrategy && <StrategyDetail strategy={selectedStrategy} onBack={() => setView("library")} onEdit={() => editStrategy()} onNewVersion={() => editStrategy()} onBacktest={() => openBacktest()} />}{view === "builder" && <StrategyBuilder draft={draft} setDraft={setDraft} onSave={saveVersion} selectedStrategy={selectedStrategy} />}{view === "backtesting" && <BacktestWorkspace strategies={strategies} request={request} setRequest={setRequest} />}{view === "compare" && <VersionCompare strategies={strategies} />}</div>;
}

export default StrategyLab;
