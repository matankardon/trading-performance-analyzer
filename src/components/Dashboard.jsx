import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

function Dashboard({ trades = [], loadingTrades = false, onAddTrade }) {
  const totalTrades = trades.length;

  const winningTrades = trades.filter(
    (trade) => Number(trade.pnl || 0) > 0
  ).length;

  const losingTrades = trades.filter(
    (trade) => Number(trade.pnl || 0) < 0
  ).length;

  const breakevenTrades = trades.filter(
    (trade) => Number(trade.pnl || 0) === 0
  ).length;

  const winRate =
    totalTrades > 0
      ? Math.round((winningTrades / totalTrades) * 100)
      : 0;

  const netPnL = trades.reduce(
    (sum, trade) => sum + Number(trade.pnl || 0),
    0
  );

  const grossProfit = trades
    .filter((trade) => Number(trade.pnl || 0) > 0)
    .reduce((sum, trade) => sum + Number(trade.pnl || 0), 0);

  const grossLoss = trades
    .filter((trade) => Number(trade.pnl || 0) < 0)
    .reduce(
      (sum, trade) => sum + Math.abs(Number(trade.pnl || 0)),
      0
    );

  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : 0;

  /*
  ==================================================
  EQUITY CURVE
  ==================================================
  */

  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = new Date(a.date || a.created_at || 0);
    const dateB = new Date(b.date || b.created_at || 0);

    return dateA - dateB;
  });

  const equityData = sortedTrades.reduce(
    (result, trade, index) => {
      const previousPnL =
        result.length > 0
          ? result[result.length - 1].pnl
          : 0;

      result.push({
        trade: index + 1,
        pnl: Number(
          (previousPnL + Number(trade.pnl || 0)).toFixed(2)
        ),
      });

      return result;
    },
    []
  );

  /*
  ==================================================
  RECENT TRADES
  ==================================================
  */

  const recentTrades = [...trades]
    .sort((a, b) => {
      const dateA = new Date(a.created_at || a.date || 0);
      const dateB = new Date(b.created_at || b.date || 0);

      return dateB - dateA;
    })
    .slice(0, 5);

  /*
  ==================================================
  PERFORMANCE BY SESSION
  ==================================================
  */

  const sessions = {};

  trades.forEach((trade) => {
    const session = trade.session || "Unknown";
    const pnl = Number(trade.pnl || 0);

    if (!sessions[session]) {
      sessions[session] = {
        trades: 0,
        wins: 0,
        pnl: 0,
      };
    }

    sessions[session].trades += 1;
    sessions[session].pnl += pnl;

    if (pnl > 0) {
      sessions[session].wins += 1;
    }
  });

  /*
  ==================================================
  PERFORMANCE BY STRATEGY
  ==================================================
  */

  const strategies = {};

  trades.forEach((trade) => {
    const strategy = trade.strategy || "No Strategy";
    const pnl = Number(trade.pnl || 0);

    if (!strategies[strategy]) {
      strategies[strategy] = {
        trades: 0,
        wins: 0,
        pnl: 0,
      };
    }

    strategies[strategy].trades += 1;
    strategies[strategy].pnl += pnl;

    if (pnl > 0) {
      strategies[strategy].wins += 1;
    }
  });

  return (
    <div className="dashboard-page">
      {/* =========================================
          HEADER
      ========================================= */}

      <header className="topbar">
        <div>
          <p className="eyebrow">TRADING OVERVIEW</p>

          <h1>Dashboard</h1>
        </div>

        <button
          className="add-trade-btn"
          onClick={onAddTrade}
        >
          + Add Trade
        </button>
      </header>

      {/* =========================================
          WELCOME
      ========================================= */}

      <section className="welcome">
        <h2>
          Good trading starts with good decisions.
        </h2>

        <p>
          Track your performance, review your trades and
          stay disciplined.
        </p>
      </section>

      {/* =========================================
          MAIN STATISTICS
      ========================================= */}

      <section className="stats-grid">
        <div className="stat-card">
          <span>Total Trades</span>

          <strong>
            {loadingTrades ? "..." : totalTrades}
          </strong>

          <small>Recorded trades</small>
        </div>

        <div className="stat-card">
          <span>Win Rate</span>

          <strong>
            {loadingTrades ? "..." : `${winRate}%`}
          </strong>

          <small>
            {winningTrades} winning · {losingTrades} losing
          </small>
        </div>

        <div className="stat-card">
          <span>Net P&amp;L</span>

          <strong
            className={
              netPnL >= 0
                ? "pnl-positive"
                : "pnl-negative"
            }
          >
            {netPnL >= 0 ? "+" : "-"}$
            {Math.abs(netPnL).toFixed(2)}
          </strong>

          <small>Current trading performance</small>
        </div>

        <div className="stat-card">
          <span>Profit Factor</span>

          <strong>
            {profitFactor.toFixed(2)}
          </strong>

          <small>
            Gross profit / gross loss
          </small>
        </div>
      </section>

      {/* =========================================
          EQUITY CURVE + RECENT TRADES
      ========================================= */}

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">PERFORMANCE</p>

              <h3>Equity Curve</h3>
            </div>
          </div>

          {loadingTrades ? (
            <div className="empty-chart">
              <p>Loading your trading history...</p>
            </div>
          ) : equityData.length === 0 ? (
            <div className="empty-chart">
              <div className="chart-line"></div>

              <p>
                Your performance chart will appear here.
              </p>

              <span>
                Add trades to start building your analytics.
              </span>
            </div>
          ) : (
            <div className="dashboard-chart">
              <ResponsiveContainer
                width="100%"
                height={260}
              >
                <AreaChart data={equityData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="trade"
                    tick={{
                      fontSize: 10,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    formatter={(value) => [
                      `$${Number(value).toFixed(2)}`,
                      "Equity",
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke="#111827"
                    fill="#e9edf2"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">RECENT ACTIVITY</p>

              <h3>Recent Trades</h3>
            </div>
          </div>

          {loadingTrades ? (
            <div className="empty-state">
              <p>Loading trades...</p>
            </div>
          ) : recentTrades.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">+</div>

              <h4>No trades yet</h4>

              <p>
                Your latest trades will appear here.
              </p>

              <button
                className="secondary-btn"
                onClick={onAddTrade}
              >
                Add Your First Trade
              </button>
            </div>
          ) : (
            <div className="recent-trades">
              {recentTrades.map((trade) => {
                const pnl = Number(trade.pnl || 0);

                return (
                  <div
                    className="recent-trade"
                    key={trade.id}
                  >
                    <div>
                      <strong>
                        {trade.asset || "Unknown"}
                      </strong>

                      <span>
                        {trade.direction || "—"} ·{" "}
                        {trade.session || "—"}
                      </span>
                    </div>

                    <strong
                      className={
                        pnl >= 0
                          ? "pnl-positive"
                          : "pnl-negative"
                      }
                    >
                      {pnl >= 0 ? "+" : "-"}$
                      {Math.abs(pnl).toFixed(2)}
                    </strong>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* =========================================
          PERFORMANCE BREAKDOWN
      ========================================= */}

      <section className="content-grid">
        {/* SESSION PERFORMANCE */}

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">SESSION ANALYSIS</p>

              <h3>Performance by Session</h3>
            </div>
          </div>

          {Object.keys(sessions).length === 0 ? (
            <div className="empty-state">
              <p>
                Add trades to see session performance.
              </p>
            </div>
          ) : (
            <div className="performance-list">
              {Object.entries(sessions).map(
                ([session, data]) => {
                  const sessionWinRate =
                    data.trades > 0
                      ? Math.round(
                          (data.wins / data.trades) * 100
                        )
                      : 0;

                  return (
                    <div
                      className="performance-row"
                      key={session}
                    >
                      <div>
                        <strong>{session}</strong>

                        <span>
                          {data.trades} trades ·{" "}
                          {sessionWinRate}% win rate
                        </span>
                      </div>

                      <strong
                        className={
                          data.pnl >= 0
                            ? "pnl-positive"
                            : "pnl-negative"
                        }
                      >
                        {data.pnl >= 0 ? "+" : "-"}$
                        {Math.abs(data.pnl).toFixed(2)}
                      </strong>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* STRATEGY PERFORMANCE */}

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">STRATEGY ANALYSIS</p>

              <h3>Performance by Strategy</h3>
            </div>
          </div>

          {Object.keys(strategies).length === 0 ? (
            <div className="empty-state">
              <p>
                Add trades to see strategy performance.
              </p>
            </div>
          ) : (
            <div className="performance-list">
              {Object.entries(strategies).map(
                ([strategy, data]) => {
                  const strategyWinRate =
                    data.trades > 0
                      ? Math.round(
                          (data.wins / data.trades) * 100
                        )
                      : 0;

                  return (
                    <div
                      className="performance-row"
                      key={strategy}
                    >
                      <div>
                        <strong>{strategy}</strong>

                        <span>
                          {data.trades} trades ·{" "}
                          {strategyWinRate}% win rate
                        </span>
                      </div>

                      <strong
                        className={
                          data.pnl >= 0
                            ? "pnl-positive"
                            : "pnl-negative"
                        }
                      >
                        {data.pnl >= 0 ? "+" : "-"}$
                        {Math.abs(data.pnl).toFixed(2)}
                      </strong>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      </section>

      {/* =========================================
          TRADE BREAKDOWN
      ========================================= */}

      <section className="panel dashboard-breakdown">
        <div className="panel-header">
          <div>
            <p className="eyebrow">TRADE BREAKDOWN</p>

            <h3>Current Trading Statistics</h3>
          </div>
        </div>

        <div className="breakdown-grid">
          <div>
            <span>Winning Trades</span>

            <strong className="pnl-positive">
              {winningTrades}
            </strong>
          </div>

          <div>
            <span>Losing Trades</span>

            <strong className="pnl-negative">
              {losingTrades}
            </strong>
          </div>

          <div>
            <span>Breakeven Trades</span>

            <strong>{breakevenTrades}</strong>
          </div>

          <div>
            <span>Gross Profit</span>

            <strong className="pnl-positive">
              +${grossProfit.toFixed(2)}
            </strong>
          </div>

          <div>
            <span>Gross Loss</span>

            <strong className="pnl-negative">
              -${grossLoss.toFixed(2)}
            </strong>
          </div>

          <div>
            <span>Average Trade</span>

            <strong>
              $
              {totalTrades > 0
                ? (netPnL / totalTrades).toFixed(2)
                : "0.00"}
            </strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;