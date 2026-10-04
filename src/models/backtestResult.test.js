import { backtestResultToDb, dbToBacktestResult } from "./backtestResult";

describe("backtest result model", () => {
  it("converts database rows to app shape and back again", () => {
    const databaseRow = {
      id: "result-1",
      user_id: "user-1",
      strategy_version_id: "version-1",
      asset: "AAPL",
      timeframe: "5m",
      session: "New York",
      start_date: "2024-02-01",
      end_date: "2024-02-02",
      config: { historicalRequest: { asset: "AAPL", timeframe: "5m" } },
      metrics: { netPnl: 250, winRate: 60, profitFactor: 1.5 },
      trades: [{ pnl: 120, entryReasoning: { liquiditySweep: { type: "low", sweptLevel: 125 } } }],
      created_at: "2024-02-02T12:00:00Z",
    };

    const model = dbToBacktestResult(databaseRow);

    expect(model).toMatchObject({
      id: "result-1",
      userId: "user-1",
      strategyVersionId: "version-1",
      asset: "AAPL",
      timeframe: "5m",
      session: "New York",
      startDate: "2024-02-01",
      endDate: "2024-02-02",
      config: { historicalRequest: { asset: "AAPL", timeframe: "5m" } },
      metrics: { netPnl: 250, winRate: 60, profitFactor: 1.5 },
      trades: [{ pnl: 120, entryReasoning: { liquiditySweep: { type: "low", sweptLevel: 125 } } }],
    });

    expect(backtestResultToDb(model)).toMatchObject({
      user_id: "user-1",
      strategy_version_id: "version-1",
      asset: "AAPL",
      timeframe: "5m",
      session: "New York",
      start_date: "2024-02-01",
      end_date: "2024-02-02",
      config: { historicalRequest: { asset: "AAPL", timeframe: "5m" } },
      metrics: { netPnl: 250, winRate: 60, profitFactor: 1.5 },
      trades: [{ pnl: 120, entryReasoning: { liquiditySweep: { type: "low", sweptLevel: 125 } } }],
    });
  });
});
