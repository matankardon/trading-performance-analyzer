import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";
import { dbToBacktestResult } from "../models/backtestResult";
import { fetchHistoricalBars } from "../services/historicalDataService";
import { compareForwardToBacktest, computeForwardStats, computeTradeStats } from "../services/forwardTestStats";
import { ruleBreakCost } from "../services/coachingAnalysis";
import { bandFromScore, computeSetupScore, matchingTrades, missingRequired } from "../services/setupChecklist";
import { copySetupSnapshot, downloadSetupSnapshot, normalizeSetupSnapshot } from "../services/setupSnapshot";
import "./TradingWorkspaces.css";

const CHECKLIST_STORAGE_KEY = "tradeCatalystSetupChecklist";
const SESSIONS = ["New York", "London", "Asia", "Overlap"];
const PRICE_RANGE_DAYS = 30;
const EMPTY_CHECKED = Object.freeze({});

function storageRead(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function storageWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The checklist remains usable when browser storage is unavailable.
  }
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function priceRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - PRICE_RANGE_DAYS);
  return { startDate: localDate(start), endDate: localDate(end) };
}

function conditionItems(version) {
  const conditions = version?.conditions || {};
  return [
    ...SETUP_CONDITIONS.filter(({ key }) => conditions[key]).map((item) => ({ ...item, type: "condition" })),
    ...INDICATORS.filter(({ key }) => conditions[key]).map((item) => ({ ...item, type: "indicator" })),
  ];
}

function requiredConditionKeys(version) {
  const configured = version?.requiredConditions ?? version?.conditions?.requiredConditions;
  return new Set(Array.isArray(configured)
    ? configured.map((item) => typeof item === "string" ? item : item?.key).filter(Boolean)
    : []);
}

function formatMoney(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? `${Number(value) < 0 ? "-" : ""}$${Math.abs(Number(value)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "n/a";
}

function formatPercent(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "n/a";
}

function formatFactor(value) {
  if (value === Number.POSITIVE_INFINITY) return "∞";
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "n/a";
}

function formatDelta(row) {
  if (row.delta === null || !Number.isFinite(row.delta)) return "n/a";
  const prefix = row.delta > 0 ? "+" : "";
  if (row.key === "winRate") return `${prefix}${row.delta.toFixed(1)}%`;
  if (row.key === "expectancy") return `${prefix}${formatMoney(row.delta)}`;
  if (row.key === "averageRiskReward") return `${prefix}${row.delta.toFixed(2)}R`;
  return `${prefix}${row.delta.toFixed(2)}`;
}

function SampleValue({ label, value, n, formatter = (entry) => String(entry) }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value === null || value === undefined ? "n/a" : formatter(value)}</strong>
      <small>n={n}{n < 5 ? " · tentative" : ""}</small>
    </div>
  );
}

function EvidencePanel({ version, versionTrades, tickedKeys, backtest, backtestError }) {
  const forward = useMemo(() => computeForwardStats(versionTrades), [versionTrades]);
  const exactConditions = useMemo(
    () => version?.id ? matchingTrades(versionTrades, version.id, tickedKeys) : [],
    [tickedKeys, version, versionTrades],
  );
  const exactStats = useMemo(() => computeTradeStats(exactConditions), [exactConditions]);
  const ruleCost = useMemo(() => ruleBreakCost(versionTrades), [versionTrades]);
  const comparison = useMemo(() => (backtest ? compareForwardToBacktest(forward, backtest) : null), [backtest, forward]);

  if (!version) return <section className="trading-workspace-card strategy-evidence"><h2>Evidence</h2><p>Select a strategy version to view its journal evidence.</p></section>;
  if (!versionTrades.length) return <section className="trading-workspace-card strategy-evidence"><h2>Evidence · {version.name} v{version.version}</h2><p>No journaled trades are linked to this version yet. The checklist remains available.</p></section>;

  return (
    <section className="trading-workspace-card strategy-evidence">
      <div><p className="eyebrow">JOURNAL EVIDENCE</p><h2>{version.name} · v{version.version}</h2></div>
      {versionTrades.length < 30 && <p className="strategy-evidence-note">Small-sample notice: n={versionTrades.length}; broader comparisons are more reliable with 30 or more trades.</p>}
      <div className="strategy-evidence-grid">
        <SampleValue label="Journal win rate" value={forward.winRate} n={forward.tradeCount} formatter={formatPercent} />
        <SampleValue label="Expectancy" value={forward.expectancy} n={forward.tradeCount} formatter={formatMoney} />
        <SampleValue label="Profit factor" value={forward.profitFactor} n={forward.tradeCount} formatter={formatFactor} />
        <SampleValue label="Average R:R" value={forward.averageRiskReward} n={forward.tradeCount} formatter={(value) => `${Number(value).toFixed(2)}R`} />
        <SampleValue label="Net P&L" value={forward.netPnl} n={forward.tradeCount} formatter={formatMoney} />
      </div>
      <div>
        <strong>When these exact conditions were present</strong>
        <p className="strategy-evidence-note">n={exactStats.tradeCount}{exactStats.tradeCount < 5 ? " · tentative" : ""} · win rate {exactStats.tradeCount ? formatPercent(exactStats.winRate) : "n/a"} · expectancy {exactStats.tradeCount ? formatMoney(exactStats.expectancy) : "n/a"}</p>
      </div>
      <div>
        <strong>Forward vs latest saved backtest</strong>
        {backtestError ? <p className="strategy-evidence-note">{backtestError}</p>
          : comparison ? <>
            <p className="strategy-evidence-note">Latest backtest sample: n={backtest.metrics?.tradeCount ?? backtest.metrics?.totalTrades ?? backtest.trades.length}</p>
            <div className="strategy-forward-table">
            <strong>Metric</strong><strong>Forward</strong><strong>Backtest</strong><strong>Delta</strong>
            {comparison.flatMap((row) => [
              <span key={`${row.key}-label`}>{row.label}</span>,
              <span key={`${row.key}-forward`}>{row.key === "winRate" ? formatPercent(row.forward) : row.key === "expectancy" ? formatMoney(row.forward) : formatFactor(row.forward)}</span>,
              <span key={`${row.key}-backtest`}>{row.key === "winRate" ? formatPercent(row.backtest) : row.key === "expectancy" ? formatMoney(row.backtest) : formatFactor(row.backtest)}</span>,
              <span key={`${row.key}-delta`}>{formatDelta(row)}</span>,
            ])}
            </div>
          </> : <p className="strategy-evidence-note">No saved backtest is available for this version.</p>}
      </div>
      <div>
        <strong>Rule-break cost</strong>
        <p className="strategy-rulebreak-note">
          Rule-break trades: n={ruleCost.ruleBreak.n}, average {formatMoney(ruleCost.ruleBreak.averagePnl)} ·
          clean trades: n={ruleCost.clean.n}, average {formatMoney(ruleCost.clean.averagePnl)}
          {ruleCost.ruleBreak.n < 5 || ruleCost.clean.n < 5 ? " · tentative" : ""}
        </p>
        <p className="strategy-rulebreak-note">
          Average difference {formatMoney(ruleCost.averagePnlDifference)} · total P&amp;L difference {formatMoney(ruleCost.totalPnlDifference)}.
        </p>
      </div>
    </section>
  );
}

export default function StrategyWorkspace({
  trades = [],
  strategyLibrary = [],
  selectedAsset = "",
  onAssetChange = () => {},
  onPageChange = () => {},
  onLogTrade = () => {},
  onAskCoach = () => {},
}) {
  const [strategyId, setStrategyId] = useState(strategyLibrary[0]?.id || "");
  const strategy = strategyLibrary.find((item) => item.id === strategyId) || strategyLibrary[0] || null;
  const versions = useMemo(() => [...(strategy?.versions || [])].sort((left, right) => Number(right.version) - Number(left.version)), [strategy]);
  const [versionId, setVersionId] = useState("");
  const version = versions.find((item) => item.id === versionId) || versions[0] || null;
  const [symbol, setSymbol] = useState(selectedAsset);
  const [checklists, setChecklists] = useState(() => storageRead(CHECKLIST_STORAGE_KEY));
  const [marketState, setMarketState] = useState({ symbol: "", bars: [], error: "" });
  const [savedBacktests, setSavedBacktests] = useState([]);
  const [backtestError, setBacktestError] = useState("");
  const [notice, setNotice] = useState("");
  const currentChecklist = checklists[version?.id] || {};
  const checked = useMemo(
    () => currentChecklist.checked && typeof currentChecklist.checked === "object" ? currentChecklist.checked : EMPTY_CHECKED,
    [currentChecklist.checked],
  );
  const session = currentChecklist.session ?? strategy?.session ?? "";
  const entryTimingReviewed = Boolean(currentChecklist.entryTimingReviewed);
  const sessionObserved = Boolean(currentChecklist.sessionObserved);

  useEffect(() => {
    storageWrite(CHECKLIST_STORAGE_KEY, checklists);
  }, [checklists]);

  useEffect(() => {
    if (!symbol) return undefined;
    let active = true;
    const range = priceRange();
    fetchHistoricalBars(symbol, "1d", range.startDate, range.endDate)
      .then((result) => {
        if (active) setMarketState({ symbol, bars: result, error: "" });
      })
      .catch((error) => {
        if (active) setMarketState({
          symbol,
          bars: [],
          error: error instanceof Error ? error.message : "Historical price data is unavailable.",
        });
      });
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => {
    let active = true;
    async function loadBacktests() {
      const ids = strategyLibrary.flatMap((item) => (item.versions || []).map(({ id }) => id).filter(Boolean));
      const { data, error } = ids.length
        ? await supabase
            .from("backtest_results")
            .select("*")
            .in("strategy_version_id", ids)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (!active) return;
      if (error) {
        setBacktestError("Saved backtest results could not be loaded.");
        setSavedBacktests([]);
        return;
      }
      setBacktestError("");
      setSavedBacktests((data || []).map(dbToBacktestResult));
    }
    loadBacktests();
    return () => { active = false; };
  }, [strategyLibrary]);

  const items = useMemo(() => conditionItems(version), [version]);
  const tickedKeys = useMemo(() => items.filter(({ key }) => checked[key]).map(({ key }) => key), [checked, items]);
  const score = computeSetupScore(version, checked);
  const requiredMissing = missingRequired(version, checked);
  const band = bandFromScore(score.score, requiredMissing.length > 0);
  const requiredKeys = requiredConditionKeys(version);
  const versionTrades = useMemo(
    () => trades.filter((trade) => trade.strategyVersionId === version?.id || trade.strategy_version_id === version?.id),
    [trades, version?.id],
  );
  const latestBacktest = savedBacktests.find((run) => run.strategyVersionId === version?.id) || null;
  const bars = marketState.symbol === symbol ? marketState.bars : [];
  const barsLoading = Boolean(symbol) && marketState.symbol !== symbol;
  const barsError = !symbol
    ? "Select a symbol to load a recent historical price."
    : marketState.symbol === symbol
      ? marketState.error
      : "";
  const latestBar = bars[bars.length - 1];
  const previousBar = bars[bars.length - 2];
  const barChange = latestBar && previousBar && previousBar.close !== 0
    ? {
        absolute: latestBar.close - previousBar.close,
        percent: ((latestBar.close / previousBar.close) - 1) * 100,
      }
    : null;
  const selectedSession = session;

  function toggleCondition(key) {
    if (!version?.id) return;
    setChecklists((previous) => {
      const current = previous[version.id] || {
        checked: {},
        session: strategy?.session || "",
        entryTimingReviewed: false,
      };
      return {
        ...previous,
        [version.id]: {
          ...current,
          checked: { ...(current.checked || {}), [key]: !current.checked?.[key] },
        },
      };
    });
  }

  function updateChecklist(field, value) {
    if (!version?.id) return;
    setChecklists((previous) => ({
      ...previous,
      [version.id]: {
        ...(previous[version.id] || {
          checked: {},
          session: strategy?.session || "",
          entryTimingReviewed: false,
        }),
        [field]: value,
      },
    }));
  }

  function resetChecklist() {
    if (!version?.id) return;
    setChecklists((previous) => ({
      ...previous,
      [version.id]: {
        checked: {},
        session: strategy?.session || "",
        entryTimingReviewed: false,
      },
    }));
  }

  function setupSnapshot() {
    return normalizeSetupSnapshot({
      symbol,
      session: selectedSession,
      direction: strategy?.direction,
      setupConditions: [...tickedKeys, ...(sessionObserved ? ["session"] : []), ...(entryTimingReviewed ? ["entryTimingReviewed"] : [])],
      setupScore: score.score,
    });
  }

  async function copySnapshot() {
    const copied = await copySetupSnapshot(setupSnapshot());
    setNotice(copied ? "Setup snapshot copied." : "Clipboard unavailable; use export instead.");
  }

  function exportSnapshot() {
    downloadSetupSnapshot(setupSnapshot());
    setNotice("Setup snapshot exported.");
  }

  function logTrade() {
    const setupFields = Object.fromEntries(SETUP_CONDITIONS.map(({ key }) => [key, Boolean(checked[key])]));
    const indicators = items.filter(({ type, key }) => type === "indicator" && checked[key]).map(({ name }) => name);
    onLogTrade({
      asset: symbol,
      strategy: strategy?.name || "",
      strategyVersionId: version?.id || null,
      session: selectedSession || "New York",
      indicators,
      ...setupFields,
    });
    if (version?.id) setChecklists((previous) => {
      const next = { ...previous };
      delete next[version.id];
      return next;
    });
  }

  const coachPrompt = `Review my ${symbol || "selected market"} setup for ${strategy?.name || "my strategy"}${version ? ` version ${version.version}` : ""}. My observed checklist items are: ${tickedKeys.map((key) => items.find((item) => item.key === key)?.label || key).join(", ") || "none selected"}. Session: ${sessionObserved ? `${selectedSession || "unspecified"} observed` : "not confirmed"}. Entry timing reviewed: ${entryTimingReviewed ? "yes" : "no"}. Compare only against the journal aggregates available in my coaching context; do not predict price.`;

  if (!strategyLibrary.length) {
    return <div className="strategy-workspace"><div className="trading-workspace-card strategy-empty-state"><h2>No saved strategies yet</h2><p>Create a strategy and version in Strategy Lab to build a pre-trade checklist from your own rules.</p><button className="add-trade-btn" type="button" onClick={() => onPageChange("Strategy Lab")}>Open Strategy Lab</button></div></div>;
  }

  return (
    <div className="strategy-workspace">
      <section className="trading-workspace-card strategy-control-grid">
        <label>Strategy<select aria-label="Strategy" value={strategy?.id || ""} onChange={(event) => setStrategyId(event.target.value)}>{strategyLibrary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Version<select aria-label="Version" value={version?.id || ""} onChange={(event) => setVersionId(event.target.value)}>{versions.map((item) => <option key={item.id} value={item.id}>v{item.version}{item === versions[0] ? " · latest" : ""}</option>)}</select></label>
        <label>Symbol<input aria-label="Strategy symbol" list="strategy-symbol-options" value={symbol} onChange={(event) => { const value = event.target.value.toUpperCase(); setSymbol(value); onAssetChange(value); }} /><datalist id="strategy-symbol-options">{[...new Set(trades.map(({ asset }) => asset).filter(Boolean))].map((asset) => <option value={asset} key={asset} />)}</datalist></label>
        <label>Session<select aria-label="Session" value={selectedSession} onChange={(event) => updateChecklist("session", event.target.value)}><option value="">Select session</option>{SESSIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </section>

      <section className="trading-workspace-card strategy-current-market">
        <div><p className="eyebrow">CURRENT MARKET · HISTORICAL DAILY BAR</p><strong>{symbol || "Symbol unavailable"}</strong><small>{barsLoading ? "Loading recent bar…" : barsError ? `Unavailable: ${barsError}` : latestBar ? `Source: Massive · bar close ${new Date(latestBar.timestamp).toLocaleString("en-US")}` : "No recent bar returned."}</small></div>
        <div><strong>{latestBar ? latestBar.close.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "--"}</strong><small>{barChange && Number.isFinite(barChange.percent) ? `Change: ${barChange.absolute >= 0 ? "+" : ""}${barChange.absolute.toFixed(4)} (${barChange.percent.toFixed(2)}%)` : "Change unavailable"}</small></div>
        {barsLoading && <div className="strategy-market-skeleton" role="status" aria-label="Loading historical market bar" />}
      </section>

      {!version ? <section className="trading-workspace-card strategy-empty-state"><p>This strategy has no saved versions. Add a version in Strategy Lab.</p><button type="button" className="secondary-btn" onClick={() => onPageChange("Strategy Lab")}>Open Strategy Lab</button></section> : <>
        <section className="strategy-checklist-layout">
          <div className="trading-workspace-card">
            <p className="eyebrow">OBSERVE · DO NOT AUTO-DETECT</p>
            <h2>{strategy.name} · v{version.version}</h2>
            {items.length ? <div className="strategy-checklist">{items.map((item) => <button key={item.key} type="button" className="setup-check-chip" aria-pressed={Boolean(checked[item.key])} onClick={() => toggleCondition(item.key)}><input type="checkbox" readOnly checked={Boolean(checked[item.key])} tabIndex="-1" /><span>{item.label}{requiredKeys.has(item.key) ? " · required" : " · optional"}</span></button>)}</div> : <p className="strategy-evidence-note">No declared setup conditions or indicators in this version.</p>}
            <div className="strategy-session-controls">
              <label className="setup-check-chip"><input type="checkbox" checked={sessionObserved} onChange={(event) => updateChecklist("sessionObserved", event.target.checked)} /> Session observed: {selectedSession || "not selected"}</label>
              <label className="setup-check-chip"><input type="checkbox" checked={entryTimingReviewed} onChange={(event) => updateChecklist("entryTimingReviewed", event.target.checked)} /> Entry timing reviewed</label>
            </div>
          </div>
          <div className="strategy-score-card">
            <span>SETUP SCORE</span><div className="strategy-score-ring" style={{ "--setup-score": `${score.score}%` }} aria-label={`Setup score ${score.score} out of 100`}>{score.score}</div>
            <strong>{score.met} of {score.total} declared items met</strong>
            <strong>{band}</strong>
            <small>Decision support only — not a prediction.</small>
            {requiredMissing.length > 0 && <div className="strategy-required-warning">Required condition missing: {requiredMissing.map(({ label }) => label).join(", ")}. Status is Not ready.</div>}
          </div>
        </section>

        <section className="strategy-evidence-layout">
          <EvidencePanel
            version={{ ...version, name: strategy.name }}
            versionTrades={versionTrades}
            tickedKeys={tickedKeys}
            backtest={latestBacktest}
            backtestError={backtestError}
          />
          <aside className="trading-workspace-card">
            <p className="eyebrow">DECLARED RULES</p><h2>Version conditions &amp; indicators</h2>
            <div className="strategy-checklist">{items.map((item) => <span className="chart-indicator-chip" key={item.key}>{item.type === "indicator" ? "Indicator" : "Condition"} · {item.label}</span>)}</div>
            <p className="strategy-evidence-note">This checklist records what you observed; it does not detect chart patterns.</p>
          </aside>
        </section>

        <div className="strategy-actions">
          <button className="add-trade-btn" type="button" onClick={logTrade}>Log this trade</button>
          <button className="secondary-btn" type="button" onClick={() => onAskCoach(coachPrompt)}>Ask coach</button>
          <button className="secondary-btn" type="button" onClick={resetChecklist}>Reset checklist</button>
          <button className="secondary-btn" type="button" onClick={copySnapshot}>Copy setup snapshot</button>
          <button className="secondary-btn" type="button" onClick={exportSnapshot}>Export to TradingView</button>
        </div>
        {notice && <p role="status" className="strategy-evidence-note">{notice}</p>}
      </>}
    </div>
  );
}
