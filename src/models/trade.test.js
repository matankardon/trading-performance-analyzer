import { dbToTrade, emptyTrade, tradeToDb } from "./trade";

describe("canonical trade model", () => {
  it("maps database rows into camelCase numeric trades", () => {
    const trade = dbToTrade({
      id: "trade-1",
      user_id: "user-1",
      entry: "100.5",
      stop_loss: "98",
      take_profit: 105,
      position_size: "2",
      risk_reward: "2.25",
      trade_time: "09:30",
      timeframe: "15m",
      liquidity_sweep: true,
      trade_quality: "A+ Setup",
    });

    expect(trade).toMatchObject({
      id: "trade-1",
      userId: "user-1",
      entry: 100.5,
      stopLoss: 98,
      takeProfit: 105,
      positionSize: 2,
      riskReward: 2.25,
      time: "09:30",
      timeframe: "15m",
      liquiditySweep: true,
      tradeQuality: "A+ Setup",
    });
  });

  it("maps canonical form fields into the database payload", () => {
    const payload = tradeToDb({
      ...emptyTrade,
      userId: "user-1",
      asset: "AAPL",
      entry: "100.5",
      stopLoss: "98",
      takeProfit: "105",
      pnl: "12.50",
      positionSize: "2",
      riskReward: "2.25",
      time: "09:30",
      timeframe: "15m",
      liquiditySweep: true,
    });

    expect(payload).toMatchObject({
      user_id: "user-1",
      asset: "AAPL",
      entry: 100.5,
      stop_loss: 98,
      take_profit: 105,
      pnl: 12.5,
      position_size: 2,
      risk_reward: 2.25,
      trade_time: "09:30",
      timeframe: "15m",
      liquidity_sweep: true,
    });
  });
});
