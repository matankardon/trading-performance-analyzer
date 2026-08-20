const investingPages = {
  Overview: {
    eyebrow: "INVESTING OVERVIEW",
    title: "Research companies. Build conviction.",
    description:
      "A calm workspace for tracking investment ideas, reviewing company quality, and deciding what deserves deeper research.",
  },
  Portfolio: {
    eyebrow: "LONG-TERM POSITIONS",
    title: "Portfolio",
    description:
      "Your longer-term holdings and investment ideas will live here when portfolio storage is connected.",
  },
  Watchlist: {
    eyebrow: "COMPANIES TO MONITOR",
    title: "Watchlist",
    description:
      "Keep companies you do not own in view without mixing them into your active positions.",
  },
  "Stocks to Research": {
    eyebrow: "RESEARCH QUEUE",
    title: "Stocks to Research",
    description:
      "A research queue, not a buy list. Future signals will help explain why a company deserves your attention.",
  },
  Opportunities: {
    eyebrow: "INVESTMENT OPPORTUNITIES",
    title: "Opportunities",
    description:
      "Potential opportunities will appear here once reliable fundamentals, valuation, and business-quality data are connected.",
  },
  "Analyst Radar": {
    eyebrow: "PROFESSIONAL SENTIMENT",
    title: "Analyst Radar",
    description:
      "Track upgrades, downgrades, estimate revisions, and changing consensus without fabricating analyst activity.",
  },
  Research: {
    eyebrow: "COMPANY RESEARCH",
    title: "Research",
    description:
      "A future home for company notes, source material, and a structured long-term investment case.",
  },
  Fundamentals: {
    eyebrow: "COMPANY HEALTH",
    title: "Fundamentals",
    description:
      "Revenue, margins, cash flow, debt, and return metrics will be shown here from connected financial sources.",
  },
  Valuation: {
    eyebrow: "PRICE VS. VALUE",
    title: "Valuation",
    description:
      "Valuation context will be added here when price, earnings, cash flow, and sector comparison data are available.",
  },
};

const portfolioColumns = [
  "Stock symbol",
  "Company name",
  "Position type",
  "Current price",
  "Entry price",
  "Unrealized return",
  "Position size",
  "Investment thesis",
  "Last review date",
];

const watchlistColumns = [
  "Symbol",
  "Company name",
  "Current price",
  "Price change",
  "Investment score",
  "Reason for monitoring",
  "Analyst sentiment",
  "Last update",
];

function EmptyResearchState({ title, description, actionLabel }) {
  return (
    <div className="investing-empty-state">
      <div className="empty-state-mark" aria-hidden="true">--</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && <button className="secondary-btn">{actionLabel}</button>}
    </div>
  );
}

export function InterpretationPanel({ mode = "investing" }) {
  const isDayTrading = mode === "day-trading";

  return (
    <section className="meaning-panel">
      <div>
        <p className="eyebrow">INTERPRETATION</p>
        <h2>What does this mean?</h2>
      </div>
      <p>
        {isDayTrading
          ? "Current trading conditions, setup readiness, and event risk will be interpreted here when market data is connected."
          : "The company’s long-term investment case will be interpreted here using observed fundamentals, valuation, business quality, and clearly labeled uncertainty."}
      </p>
      <span className="data-status">Awaiting connected data sources</span>
    </section>
  );
}

function EmptyTable({ columns, title, description }) {
  return (
    <div className="investing-table-wrap">
      <table className="investing-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length}>
              <EmptyResearchState title={title} description={description} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InvestingWorkspace({ page = "Overview" }) {
  const content = investingPages[page] || investingPages.Overview;
  const isOverview = page === "Overview";

  return (
    <div className="investing-workspace">
      <header className="topbar investing-topbar">
        <div>
          <p className="eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p className="workspace-description">{content.description}</p>
        </div>
      </header>

      {isOverview ? (
        <>
          <section className="investing-signal-grid">
            <div className="investing-signal-card"><span>Portfolio</span><strong>--</strong><small>No positions connected</small></div>
            <div className="investing-signal-card"><span>Watchlist</span><strong>--</strong><small>No companies added</small></div>
            <div className="investing-signal-card"><span>Research queue</span><strong>--</strong><small>Real signals pending</small></div>
            <div className="investing-signal-card"><span>Analyst radar</span><strong>--</strong><small>No activity connected</small></div>
          </section>

          <section className="investing-overview-grid">
            <div className="workspace-panel">
              <div className="panel-header"><div><p className="eyebrow">RESEARCH QUEUE</p><h2>Stocks to Research</h2></div><span className="panel-tag">No ranking yet</span></div>
              <EmptyResearchState title="Your research queue is ready" description="Future companies will be ranked from measurable fundamentals, growth, valuation, revisions, and industry signals." actionLabel="Open research queue" />
            </div>
            <div className="workspace-panel">
              <div className="panel-header"><div><p className="eyebrow">PORTFOLIO CONTEXT</p><h2>Portfolio overview</h2></div><span className="panel-tag">No holdings</span></div>
              <EmptyResearchState title="No investment positions yet" description="Long Term, Swing, Building Position, and Watch categories will be available here without touching the trade journal." actionLabel="View portfolio" />
            </div>
          </section>

          <InterpretationPanel />
        </>
      ) : page === "Portfolio" ? (
        <section className="workspace-panel full-width-panel"><div className="panel-header"><div><p className="eyebrow">POSITION REGISTER</p><h2>Long-term portfolio</h2></div><span className="panel-tag">No holdings</span></div><EmptyTable columns={portfolioColumns} title="Your portfolio is empty" description="Add connected holdings later. No positions or performance are being inferred here." /></section>
      ) : page === "Watchlist" ? (
        <section className="workspace-panel full-width-panel"><div className="panel-header"><div><p className="eyebrow">MONITORING LIST</p><h2>Companies to monitor</h2></div><span className="panel-tag">No companies</span></div><EmptyTable columns={watchlistColumns} title="Your watchlist is empty" description="Companies you want to research but do not own will appear here once a watchlist data model is connected." /></section>
      ) : page === "Analyst Radar" ? (
        <section className="workspace-panel full-width-panel"><div className="panel-header"><div><p className="eyebrow">ANALYST RADAR</p><h2>Changes in professional sentiment</h2></div><span className="panel-tag">No activity</span></div><EmptyResearchState title="No reliable analyst activity available" description="Future events will include the company, source, action, date, previous view, new view, source, and why it matters." /></section>
      ) : page === "Stocks to Research" ? (
        <section className="workspace-panel full-width-panel"><div className="panel-header"><div><p className="eyebrow">RESEARCH QUEUE</p><h2>Which stocks are worth investigating?</h2></div><span className="panel-tag">Not a buy list</span></div><div className="research-principles"><span>Why this stock is here</span><span>Research Score</span><span>Watch</span><span>Needs Review</span></div><EmptyResearchState title="Research signals are not connected" description="This queue will use measurable business, growth, valuation, earnings, institutional, and industry signals. It will never promise a guaranteed winner." /></section>
      ) : (
        <section className="workspace-panel full-width-panel"><div className="panel-header"><div><p className="eyebrow">{content.eyebrow}</p><h2>{content.title}</h2></div><span className="panel-tag">Coming later</span></div><EmptyResearchState title="This workspace is ready for real data" description={content.description} /></section>
      )}
    </div>
  );
}

export default InvestingWorkspace;
