import { useMemo, useState } from "react";
import { analyzeCoaching, MIN_SAMPLE } from "../services/coachingAnalysis";
import "./Coaching.css";

function money(value, signed = false) {
  if (value === null || !Number.isFinite(value)) return "—";
  const prefix = signed && value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

function percent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function Table({ factor }) {
  const [sortDirection, setSortDirection] = useState("desc");
  const groups = useMemo(() => [...factor.groups].sort((left, right) => (
    sortDirection === "desc"
      ? right.expectancy - left.expectancy
      : left.expectancy - right.expectancy
  )), [factor.groups, sortDirection]);

  return (
    <section className="coaching-factor-card">
      <header><h3>{factor.label}</h3><span>{factor.groups.length} groups</span></header>
      <div className="coaching-table-scroll">
        <table className="coaching-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Trades</th>
              <th>Win rate</th>
              <th>Net P&amp;L</th>
              <th>
                <button
                  type="button"
                  className="coaching-sort-button"
                  aria-label={`Sort ${factor.label} by expectancy ${sortDirection === "desc" ? "ascending" : "descending"}`}
                  onClick={() => setSortDirection((direction) => direction === "desc" ? "asc" : "desc")}
                >
                  Expectancy {sortDirection === "desc" ? "↓" : "↑"}
                </button>
              </th>
              <th>Profit factor</th>
              <th>Avg R:R</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.key} className={group.lowSample ? "low-sample" : ""}>
                <td>{group.key}</td>
                <td>{group.n}{group.n < MIN_SAMPLE && <small className="sample-chip">n&lt;5</small>}</td>
                <td>{percent(group.winRate)}</td>
                <td className={group.netPnl < 0 ? "negative" : "positive"}>{money(group.netPnl, true)}</td>
                <td className={group.expectancy < 0 ? "negative" : "positive"}>{money(group.expectancy, true)}</td>
                <td>{typeof group.profitFactor === "number" ? group.profitFactor.toFixed(2) : group.profitFactor}</td>
                <td>{group.averageRiskReward === null ? "—" : group.averageRiskReward.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Coaching({ trades = [], strategyLibrary = [] }) {
  const [strategyVersion, setStrategyVersion] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const versions = useMemo(() => strategyLibrary.flatMap((strategy) => (
    (strategy.versions || []).map((version) => ({
      id: version.id,
      label: `${strategy.name || "Strategy"} · v${version.version ?? version.versionNumber ?? "?"}`,
    }))
  )), [strategyLibrary]);

  const filteredTrades = useMemo(() => trades.filter((trade) => {
    const versionId = trade.strategyVersionId ?? trade.strategy_version_id ?? null;
    const date = String(trade.date ?? "").slice(0, 10);
    return (strategyVersion === "All" || versionId === strategyVersion)
      && (!fromDate || date && date >= fromDate)
      && (!toDate || date && date <= toDate);
  }), [trades, strategyVersion, fromDate, toDate]);
  const analysis = useMemo(() => analyzeCoaching(filteredTrades), [filteredTrades]);

  if (trades.length === 0) {
    return (
      <div className="coaching-page">
        <header className="coaching-header">
          <p className="eyebrow">JOURNAL-BASED PATTERNS</p>
          <h1>Coaching</h1>
          <p>Descriptive patterns from your recorded trades. Patterns are not proof of cause or future results.</p>
        </header>
        <div className="coaching-empty">
          <span className="coaching-empty-mark" aria-hidden="true">+</span>
          <h2>Start with a complete trade journal</h2>
          <p>Log each trade’s result, session, setup conditions, indicators, trade quality, rule adherence, and strategy version. Coaching will summarize patterns from the records you save.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coaching-page">
      <header className="coaching-header">
        <p className="eyebrow">JOURNAL-BASED PATTERNS</p>
        <h1>Coaching</h1>
        <p>Descriptive patterns from recorded trades—not causes, predictions, or trade recommendations.</p>
      </header>

      <div className="coaching-filters" aria-label="Filter coaching trades">
        <label>
          Strategy version
          <select value={strategyVersion} onChange={(event) => setStrategyVersion(event.target.value)}>
            <option value="All">All versions</option>
            {versions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}
          </select>
        </label>
        <label>
          From
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <span>{analysis.totalTrades} trades analyzed</span>
      </div>

      {filteredTrades.length === 0 ? (
        <div className="coaching-empty">
          <span className="coaching-empty-mark" aria-hidden="true">0</span>
          <h2>No trades match these filters</h2>
          <p>Adjust the strategy version or date range to see journal patterns.</p>
        </div>
      ) : <>
      <section className="coaching-section coaching-insights">
        <header className="coaching-section-heading">
          <div><p className="eyebrow">PATTERNS IN YOUR JOURNAL</p><h2>Key Insights</h2></div>
          <span>Sorted by observed expectancy difference</span>
        </header>
        {analysis.sampleNotice && <p className="coaching-sample-notice">{analysis.sampleNotice}</p>}
        {analysis.insights.length ? (
          <ol className="coaching-insight-list">
            {analysis.insights.slice(0, 5).map((insight) => <li key={insight.text}>{insight.text}</li>)}
          </ol>
        ) : (
          <p className="coaching-no-insights">No factor comparison has at least {MIN_SAMPLE} trades in both groups yet. Low-sample rows remain visible below.</p>
        )}
      </section>

      <section className="coaching-section coaching-rule-cost">
        <header className="coaching-section-heading">
          <div><p className="eyebrow">RULE ADHERENCE</p><h2>Rule-Break Cost</h2></div>
          <span>Observed P&amp;L comparison; not a causal estimate</span>
        </header>
        <div className="coaching-rule-grid">
          {[
            ["Rule-break trades", analysis.ruleBreakCost.ruleBreak],
            ["Clean trades", analysis.ruleBreakCost.clean],
          ].map(([label, group]) => (
            <div className={`coaching-rule-card ${group.lowSample ? "low-sample" : ""}`} key={label}>
              <span>{label}</span>
              <strong>{money(group.averagePnl, true)} <small>avg P&amp;L</small></strong>
              <p>{group.n} trades · {money(group.totalPnl, true)} total</p>
              {group.lowSample && <em>n&lt;5</em>}
            </div>
          ))}
          <div className="coaching-rule-difference">
            <span>Average P&amp;L difference</span>
            <strong>{money(analysis.ruleBreakCost.averagePnlDifference, true)}</strong>
            <p>Rule-break average minus clean-trade average</p>
            <small>Total P&amp;L difference: {money(analysis.ruleBreakCost.totalPnlDifference, true)}</small>
          </div>
        </div>
      </section>

      <section className="coaching-section">
        <header className="coaching-section-heading">
          <div><p className="eyebrow">JOURNAL DIMENSIONS</p><h2>Performance by Factor</h2></div>
          <span>Click expectancy to change sort order</span>
        </header>
        <div className="coaching-factor-grid">
          {analysis.factors.map((factor) => <Table factor={factor} key={factor.key} />)}
        </div>
      </section>

      <section className="coaching-section">
        <header className="coaching-section-heading">
          <div><p className="eyebrow">COMBINED CONDITIONS</p><h2>Best / Worst Combos</h2></div>
          <span>Only combinations with at least {MIN_SAMPLE} observed trades</span>
        </header>
        <div className="coaching-combo-grid">
          {[
            ["Best combinations", analysis.combos.best],
            ["Worst combinations", analysis.combos.worst],
          ].map(([title, combos]) => (
            <div className="coaching-combo-column" key={title}>
              <h3>{title}</h3>
              {combos.length ? combos.map((combo) => (
                <article className="coaching-combo-card" key={combo.key}>
                  <div><strong>{combo.conditions.join(" + ")}</strong><span>{combo.n} trades</span></div>
                  <p>Expectancy <b className={combo.expectancy < 0 ? "negative" : "positive"}>{money(combo.expectancy, true)}</b> · Win rate {percent(combo.winRate)}</p>
                </article>
              )) : <p className="coaching-no-insights">Not enough repeated combinations yet.</p>}
            </div>
          ))}
        </div>
      </section>
      </>}
    </div>
  );
}

export default Coaching;
