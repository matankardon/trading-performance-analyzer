import { describe, expect, it } from "vitest";
import { tradeChartLevels, tradeChartTimeframe, tradeChartWindow } from "./tradeChart";

describe("trade chart helpers", () => {
  it("maps saved timeframe values and falls back to 15m", () => {
    expect(tradeChartTimeframe({ timeframe: "1h" })).toBe("1h");
    expect(tradeChartTimeframe({ timeframe: "60m" })).toBe("1h");
    expect(tradeChartTimeframe({ timeframe: "unsupported" })).toBe("15m");
  });

  it("computes an entry-centered 60-before and 120-after UTC window", () => {
    const window = tradeChartWindow({ date: "2025-01-02", time: "12:07:00" }, "5m");
    expect(window).toEqual({
      startTimestamp: Date.UTC(2025, 0, 2, 7, 5),
      endTimestamp: Date.UTC(2025, 0, 2, 22, 5),
      startDate: "2025-01-02",
      endDate: "2025-01-02",
      entryTimestamp: Date.UTC(2025, 0, 2, 12, 7),
    });
  });

  it("uses the whole UTC trade day plus one day on either side when time is missing", () => {
    expect(tradeChartWindow({ date: "2025-01-01" }, "15m")).toEqual({
      startTimestamp: Date.UTC(2024, 11, 31),
      endTimestamp: Date.UTC(2025, 0, 3) - 1,
      startDate: "2024-12-31",
      endDate: "2025-01-02",
      entryTimestamp: null,
    });
    expect(tradeChartWindow({ date: "2025-02-30", time: "09:00" })).toBeNull();
  });

  it.each([
    [{ direction: "Long", entry: 100, stopLoss: 95, takeProfit: 115, exit: 110, pnl: 50 }, 3],
    [{ direction: "Short", entry: 100, stopLoss: 105, takeProfit: 90, exit: null, pnl: -10 }, 2],
    [{ entry: 100, stopLoss: null, takeProfit: null, exit: null, pnl: "" }, null],
  ])("calculates finite price levels and risk/reward for %#", (trade, expectedRR) => {
    const result = tradeChartLevels(trade);
    expect(result.riskReward).toBe(expectedRR);
    expect(result.levels.every(({ value }) => Number.isFinite(value))).toBe(true);
    expect(Number.isFinite(result.pnl) || result.pnl === null).toBe(true);
  });
});
