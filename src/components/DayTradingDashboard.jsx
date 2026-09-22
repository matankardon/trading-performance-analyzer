import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import {
  copySetupSnapshot,
  downloadSetupSnapshot,
  normalizeSetupSnapshot,
} from "../services/setupSnapshot";

const scoreFactors = [
  { label: "Market Structure", maximum: 25 },
  { label: "Momentum", maximum: 20 },
  { label: "Volatility", maximum: 20 },
  { label: "Market Context", maximum: 15 },
  { label: "Event Risk", maximum: 10 },
  { label: "Sentiment", maximum: 10 },
  { label: "Expert View", maximum: null },
];

const conditionFields = [
  { key: "trend", label: "Trend" },
  { key: "momentum", label: "Momentum" },
  { key: "volatility", label: "Volatility" },
  { key: "volume", label: "Volume" },
  { key: "relativeVolume", label: "Relative Volume" },
  { key: "vwap", label: "VWAP" },
  { key: "atr", label: "ATR" },
  { key: "structure", label: "Structure" },
  { key: "session", label: "Session" },
  { key: "liquidity", label: "Liquidity" },
];

const primaryConditionFields = conditionFields.slice(0, 3);
const secondaryConditionFields = conditionFields.slice(3);

const structureFields = [
  ["Swing High", "swingHigh"],
  ["Swing Low", "swingLow"],
  ["Previous Day High", "previousDayHigh"],
  ["Previous Day Low", "previousDayLow"],
  ["Liquidity", "liquidity"],
  ["Market Structure Shift", "marketStructureShift"],
  ["Fair Value Gap", "fairValueGap"],
  ["Order Block", "orderBlock"],
];

const strategyChecks = [
  "Liquidity Sweep",
  "MSS",
  "Displacement",
  "FVG",
  "Order Block",
  "Stochastic Confirmation",
  "Session",
  "Entry Timing",
];

function unavailable(value) {
  return value === undefined || value === null || value === "";
}

function SourceMeta({ source, updated, status = "Unavailable" }) {
  return (
    <div className="source-meta">
      <span>Source: {source || "Not connected"}</span>
      <span>Last updated: {updated || "--"}</span>
      <span className="data-status">{status}</span>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, status, icon }) {
  return (
    <div className="decision-section-header">
      <div>
        <p className="eyebrow">{icon && <span className="section-header-icon" aria-hidden="true">{icon}</span>}{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="section-header-context">
        {description && <p>{description}</p>}
        {status && <span className="section-status">{status}</span>}
      </div>
    </div>
  );
}

function UnavailableState({ title, description }) {
  return (
    <div className="decision-empty-state">
      <span className="empty-state-mark" aria-hidden="true">--</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function MarketHeader({ market, asset, onAssetChange }) {
  const hasPrice = !unavailable(market.price);
  const hasAsset = !unavailable(market.asset);

  return (
    <section className="market-header-panel">
      <div className="market-header-main">
        <div>
          <p className="eyebrow">MARKET CONTEXT</p>
          <label className="asset-selector-label" htmlFor="dashboard-asset">Selected asset</label>
          <div className="asset-selector-row">
            <input id="dashboard-asset" value={asset} onChange={(event) => onAssetChange(event.target.value.toUpperCase())} placeholder="Enter symbol" />
            <h2>{hasAsset ? market.asset : asset || "Selected market"}</h2>
          </div>
          <p className="market-header-state">
            {hasPrice ? "Current market data received" : "Live market data not connected"}
          </p>
        </div>
        <div className="market-price-block">
          <strong>{hasPrice ? market.price : "--"}</strong>
          <span className={market.changeDirection === "positive" ? "status-positive" : "status-neutral"}>
            {hasPrice && !unavailable(market.change) ? market.change : "Price change unavailable"}
          </span>
        </div>
      </div>
      <div className="market-context-grid">
        <div><span>Market / session</span><strong>{market.session || "Waiting for data"}</strong></div>
        <div><span>Market status</span><strong className="status-neutral">{market.status || "Data unavailable"}</strong></div>
        <div><span>Data</span><strong>{market.freshness || "Unavailable"}</strong></div>
        <div><span>Last update</span><strong>{market.updated || "--"}</strong></div>
      </div>
      <SourceMeta source={market.source} updated={market.updated} status={market.freshness || "Unavailable"} />
    </section>
  );
}

function ScoreGauge({ value }) {
  const numericValue = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : null;
  const chartData = [{ name: "Score", value: numericValue ?? 0, fill: "var(--color-gold)" }];

  return (
    <div className="score-gauge-shell" aria-label={numericValue !== null ? `Market trading score ${numericValue} out of 100` : "Market trading score unavailable"}>
      <ResponsiveContainer width="100%" height={160}>
        <RadialBarChart
          data={chartData}
          innerRadius="58%"
          outerRadius="100%"
          barSize={16}
          startAngle={180}
          endAngle={0}
          cx="50%"
          cy="58%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar background clockWise dataKey="value" cornerRadius={10} fill="var(--color-gold)" />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="score-gauge-center">
        <strong>{numericValue ?? "--"}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

function ScoreBreakdownChart({ items = [] }) {
  if (!items.length) {
    return (
      <div className="chart-empty-state">
        <span>Awaiting score data</span>
      </div>
    );
  }

  const data = items.map((item) => ({
    name: item.label,
    value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0,
  }));

  return (
    <div className="score-breakdown-chart">
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={24} outerRadius={46} paddingAngle={2} stroke="transparent">
            {data.map((entry, index) => (
              <Cell key={`${entry.name}-${index}`} fill={index % 2 === 0 ? "var(--color-gold)" : "#e0e7f0"} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function MarketTradingScore({ score }) {
  const [showDetails, setShowDetails] = useState(false);
  const hasScore = !unavailable(score.value);

  const breakdown = scoreFactors
    .map((factor) => ({
      label: factor.label,
      value: score.factors?.[factor.label],
      maximum: factor.maximum,
    }))
    .filter((item) => !unavailable(item.value));

  return (
    <section className="score-panel overview-score-panel">
      <div className="score-summary">
        <div>
          <p className="eyebrow">MARKET TRADING SCORE</p>
          <h2>How favorable is this environment for short-term trading?</h2>
          <p className="score-disclaimer">Decision support only — not a price-direction prediction.</p>
        </div>
      </div>
      <div className="overview-score-body">
        <ScoreGauge value={score.value} />
        <div className="score-factor-list">
          {scoreFactors.map((factor) => {
            const factorValue = score.factors?.[factor.label];
            return (
              <div className="score-factor-row" key={factor.label}>
                <span>{factor.label}</span>
                <strong>{unavailable(factorValue) ? "--" : `${factorValue}${factor.maximum ? ` / ${factor.maximum}` : ""}`}</strong>
              </div>
            );
          })}
        </div>
      </div>
      <div className="score-footer">
        <span>{score.confidence || "Awaiting market data and analysis"}</span>
        <button className="text-button" type="button" onClick={() => setShowDetails((visible) => !visible)}>
          {showDetails ? "Hide score details" : "View score details"}
        </button>
      </div>
      {showDetails && (
        <div className="score-details">
          {scoreFactors.map((factor) => {
            const factorValue = score.factors?.[factor.label];
            return (
              <div className="score-factor" key={factor.label}>
                <span>{factor.label}</span>
                <strong>{unavailable(factorValue) ? "--" : `${factorValue} / ${factor.maximum || "--"}`}</strong>
                <small>{unavailable(factorValue) ? "Awaiting analysis" : "Provider value"}</small>
              </div>
            );
          })}
        </div>
      )}
      <div className="overview-score-chart-wrap">
        <ScoreBreakdownChart items={breakdown} />
      </div>
      <SourceMeta source={score.source} updated={score.updated} status={hasScore ? score.status : "Unavailable"} />
    </section>
  );
}

function MarketConditions({ conditions }) {
  function renderMetric(field) {
    const value = conditions?.[field.key];
    const tone = conditions?.[`${field.key}Tone`] || "unavailable";

    return (
      <div className={`condition-card condition-${tone}`} key={field.key}>
        <span>{field.label}</span>
        <strong>{unavailable(value) ? "N/A" : value}</strong>
        <small>{unavailable(value) ? "Waiting for data" : "Provider value"}</small>
      </div>
    );
  }

  return (
    <section className="decision-panel conditions-module">
      <SectionHeader eyebrow="MARKET CONDITIONS" title="Current intraday environment" description="Primary conditions first, supporting metrics below." status="Awaiting data" icon="01" />
      <div className="condition-overview-row">
        <div className="condition-overview-label"><span>Overall condition</span><strong>Unavailable</strong><small>Requires normalized market analysis</small></div>
        <div className="condition-primary-grid">{primaryConditionFields.map(renderMetric)}</div>
      </div>
      <div className="condition-secondary-group">
        <div className="subsection-label"><span>Supporting metrics</span><small>Volume, price context, and session detail</small></div>
        <div className="condition-grid condition-secondary-grid">{secondaryConditionFields.map(renderMetric)}</div>
      </div>
      <SourceMeta source={conditions?.source} updated={conditions?.updated} />
    </section>
  );
}

function MarketStructure({ conditions }) {
  return (
    <section className="decision-panel structure-module">
      <SectionHeader eyebrow="MARKET STRUCTURE" title="Technical map of the session" description="Levels and setup elements stay separate from broader market conditions." status="Chart analysis pending" icon="02" />
      <div className="structure-block">
        <div className="subsection-label"><span>Swing structure</span><small>Higher highs and lower lows</small></div>
        <div className="structure-level-grid">
          {structureFields.slice(0, 4).map(([label, key]) => <div className="structure-level" key={key}><span>{label}</span><strong>{conditions?.[key] || "--"}</strong></div>)}
        </div>
      </div>
      <div className="structure-block">
        <div className="subsection-label"><span>Liquidity and setup elements</span><small>Detected, inferred, or uncertain</small></div>
        <div className="structure-diagnostic-grid">
          {structureFields.slice(4).map(([label, key]) => <div className="structure-diagnostic" key={key}><span>{label}</span><strong>{conditions?.[key] || "Waiting"}</strong></div>)}
        </div>
      </div>
      <SourceMeta source={conditions?.source} updated={conditions?.updated} />
    </section>
  );
}

function StrategyReadiness({ strategy }) {
  return (
    <section className="decision-panel strategy-module">
      <SectionHeader eyebrow="YOUR STRATEGY" title="Pre-entry checklist" description="Market Trading Score and Setup Score remain independent decision-support signals." status="Chart analysis pending" icon="07" />
      <div className="strategy-layout">
        <div className="strategy-checks">{strategyChecks.map((check) => <div className="strategy-check" key={check}><span>{check}</span><strong>{strategy?.[check] || "Waiting for chart analysis"}</strong></div>)}</div>
        <div className="setup-score-card"><span>SETUP SCORE</span><strong>{strategy?.score || "--"}</strong><small>How well the setup matches your strategy</small><span className="decision-badge">{strategy?.state || "Decision unavailable"}</span></div>
      </div>
      <SourceMeta source={strategy?.source} updated={strategy?.updated} status={strategy?.status || "Unavailable"} />
    </section>
  );
}

function SetupExport({ symbol }) {
  const [message, setMessage] = useState("");

  async function handleCopy() {
    const snapshot = normalizeSetupSnapshot({
      symbol: symbol.trim() || undefined,
      timestamp: new Date().toISOString(),
    });
    const copied = await copySetupSnapshot(snapshot);
    setMessage(copied ? "Setup snapshot copied" : "Clipboard unavailable; download the snapshot instead");
  }

  function handleDownload() {
    downloadSetupSnapshot(normalizeSetupSnapshot({
      symbol: symbol.trim() || undefined,
      timestamp: new Date().toISOString(),
    }));
    setMessage("Setup snapshot downloaded");
  }

  return (
    <section className="setup-export-panel">
      <div>
        <p className="eyebrow">CHART / SETUP ANALYSIS</p>
        <h2>Carry the plan to TradingView</h2>
        <p>Direct drawing insertion into a normal TradingView workspace is not connected. Export the canonical snapshot for manual chart review instead.</p>
      </div>
      <div className="setup-export-actions">
        <button className="secondary-btn" type="button" onClick={handleCopy}>Copy setup snapshot</button>
        <button className="add-trade-btn" type="button" onClick={handleDownload}>Export setup to TradingView</button>
      </div>
      <small className="setup-export-note">Only available values are included. {message || "No setup levels have been detected."}</small>
    </section>
  );
}

function QuickAccess({ onPageChange }) {
  const links = [
    ["Markets", "Market"],
    ["Events & News", "Events & News"],
    ["Sentiment", "Sentiment"],
    ["Strategy", "Strategy"],
    ["Chart", "Chart"],
  ];

  return (
    <div className="quick-access">
      <span className="subsection-label">Continue to</span>
      <div>{links.map(([page, label]) => <button type="button" className="quick-access-link" key={page} onClick={() => onPageChange(page)}>{label}<span aria-hidden="true">→</span></button>)}</div>
    </div>
  );
}

function OverviewPage({ market, strategy, selectedAsset, onAssetChange, onPageChange, score }) {
  const [showMore, setShowMore] = useState(false);
  const status = market.status || "WAITING FOR DATA";
  const direction = market.bias || "Unavailable";

  const recommendation =
    strategy.state === "TRADE"
      ? "Trade only with strong confirmation."
      : strategy.state === "WAIT"
        ? "Wait for cleaner confirmation."
        : strategy.state === "AVOID"
          ? "Avoid fresh entries for now."
          : status === "Bullish"
            ? "Conditions are constructive, but wait for confirmation."
            : status === "Bearish"
              ? "Risk is elevated; wait for a clearer setup."
              : "Market is unclear. Wait for better confirmation.";

  return (
    <>
      <div className="overview-primary-row">
        <MarketHeader market={market} asset={selectedAsset} onAssetChange={onAssetChange} />
        <div className="overview-score-stack">
          <MarketTradingScore score={score} />
          <div className="overview-action-card">
            <p className="eyebrow">WHAT SHOULD I DO?</p>
            <strong>{recommendation}</strong>
            <small>{strategy.state ? `Setup: ${strategy.state}` : "Setup signal waiting for data"}</small>
          </div>
        </div>
      </div>

      <section className="overview-status-strip">
        <div><span>Market status</span><strong>{status}</strong><small>{market.statusReason || "Live data pending"}</small></div>
        <div><span>Bias</span><strong>{direction}</strong><small>Separate from score</small></div>
        <div><span>Setup</span><strong>{strategy.state || "Unavailable"}</strong><small>{strategy.score ? `Score ${strategy.score}` : "Waiting"}</small></div>
      </section>

      <div className="overview-toggle-row">
        <button type="button" className="secondary-btn overview-toggle-btn" onClick={() => setShowMore((value) => !value)}>
          {showMore ? "Hide more detail" : "See more detail"}
        </button>
      </div>

      {showMore && (
        <div className="overview-detail-panel">
          <div className="overview-insights-grid">
            <section className="overview-factors">
              <div className="overview-factors-heading"><div><p className="eyebrow">TOP 3 THINGS TO KNOW</p><h2>What deserves attention first</h2></div><span className="section-status">Priority view</span></div>
              <ol>
                {(market.topFactors || []).slice(0, 3).map((factor, index) => <li key={factor.id || factor.text || index}><span>{index + 1}</span><strong>{factor.text || factor}</strong><small>{factor.context || "Provider context unavailable"}</small></li>)}
                {(!market.topFactors || market.topFactors.length === 0) && <li className="overview-factor-empty"><span>--</span><strong>Waiting for normalized market analysis</strong><small>The three highest-priority factors will appear here when data is connected.</small></li>}
              </ol>
            </section>
            <section className="overview-meaning">
              <div><p className="eyebrow">WHAT DOES THIS MEAN?</p><h2>{market.interpretationTitle || "Waiting for sufficient market data"}</h2></div>
              <p>{market.interpretation || "The Overview will translate market conditions, risk, and setup readiness into a concise trading context when analysis data is available."}</p>
              <div className="overview-meaning-tags"><span>{market.bias || "Bias unavailable"}</span><span>{market.risk || "Risk unavailable"}</span><span>{market.confirmation || "Confirmation unavailable"}</span></div>
            </section>
          </div>

          <section className="overview-readiness">
            <div><p className="eyebrow">SETUP READINESS</p><h2>Does the current setup match your strategy?</h2><p>{strategy.state || "Setup analysis is waiting for chart data."}</p></div>
            <div className="overview-readiness-score"><span>SETUP SCORE</span><strong>{strategy.score || "--"}</strong><small>Independent from Market Trading Score</small></div>
            <button type="button" className="secondary-btn" onClick={() => onPageChange("Strategy")}>View Strategy Analysis <span aria-hidden="true">→</span></button>
          </section>
        </div>
      )}

      <QuickAccess onPageChange={onPageChange} />
    </>
  );
}

function MarketPage({ market, conditions, selectedAsset, onAssetChange }) {
  return (
    <>
      <MarketHeader market={market} asset={selectedAsset} onAssetChange={onAssetChange} />
      <div className="workspace-page-heading"><p className="eyebrow">MARKET DETAIL</p><h1>Market conditions and structure</h1><p>Move from the current state into the technical evidence behind it.</p></div>
      <div className="dashboard-v2-grid dashboard-v2-grid-structure"><MarketConditions conditions={conditions} /><MarketStructure conditions={conditions} /></div>
      <section className="market-context-placeholder"><SectionHeader eyebrow="MARKET CONTEXT" title="Cross-market context" description="Indexes, futures, DXY, VIX, yields, sectors, and correlations will appear here when providers are connected." status="Unavailable" icon="03" /><UnavailableState title="Market context data unavailable" description="No correlated-asset values are being inferred without a connected provider." /></section>
    </>
  );
}

function StrategyPage({ strategy, selectedAsset, onPageChange }) {
  return (
    <>
      <div className="workspace-page-heading"><p className="eyebrow">STRATEGY WORKSPACE</p><h1>Setup diagnostic</h1><p>Review the current market, conditions, and final setup state before execution.</p></div>
      <section className="strategy-market-context"><span>Current market</span><strong>{selectedAsset || "Selected market unavailable"}</strong><small>Market analysis and chart detection will populate this context.</small></section>
      <StrategyReadiness strategy={strategy} />
      <div className="strategy-final-state"><div><p className="eyebrow">FINAL STATE</p><h2>{strategy.state || "Decision unavailable"}</h2></div><p>Do not treat this as a prediction. The final state requires sufficient market and setup data.</p></div>
      <SetupExport symbol={selectedAsset} />
      <button type="button" className="text-button workspace-back-link" onClick={() => onPageChange("Overview")}>Back to Overview</button>
    </>
  );
}

function ChartPage({ selectedAsset }) {
  return (
    <>
      <div className="workspace-page-heading"><p className="eyebrow">CHART WORKSPACE</p><h1>{selectedAsset || "Selected market"}</h1><p>Visual analysis will become the primary surface for levels, zones, and strategy annotations.</p></div>
      <section className="chart-workspace"><div className="chart-workspace-toolbar"><span>Chart canvas</span><span className="section-status">Waiting for chart data</span></div><UnavailableState title="Chart analysis is not connected" description="Swing levels, liquidity, FVG, order blocks, MSS, entry, stop, and target annotations will appear here when chart data is available." /></section>
      <SetupExport symbol={selectedAsset} />
    </>
  );
}

function DayTradingDashboard({ page = "Overview", onAddTrade, selectedAsset = "", onAssetChange, onPageChange = () => {} }) {
  const market = {};
  const score = {};
  const conditions = {};
  const strategy = {};

  return (
    <div className="day-trading-dashboard">
      <header className="topbar dashboard-v2-header">
        <div><p className="eyebrow">DAY TRADING / {page.toUpperCase()}</p><h1>{page === "Overview" ? "What is happening right now?" : page}</h1><p className="dashboard-v2-subtitle">{page === "Overview" ? "Understand current market conditions before you decide to trade, wait, or avoid." : "A focused workspace for the next layer of your trading process."}</p></div>
        {page === "Overview" && <div className="dashboard-v2-actions"><button className="add-trade-btn" type="button" onClick={onAddTrade}>+ Add Trade</button></div>}
      </header>
      {page === "Overview" && <OverviewPage market={market} strategy={strategy} selectedAsset={selectedAsset} onAssetChange={onAssetChange} onPageChange={onPageChange} score={score} />}
      {page === "Markets" && <MarketPage market={market} conditions={conditions} selectedAsset={selectedAsset} onAssetChange={onAssetChange} />}
      {page === "Strategy" && <StrategyPage strategy={strategy} selectedAsset={selectedAsset} onPageChange={onPageChange} />}
      {page === "Chart" && <ChartPage selectedAsset={selectedAsset} />}
    </div>
  );
}

export default DayTradingDashboard;
