import { describe, expect, it } from "vitest";
import { buildMonthGrid, dayStats, groupTradesByDay, monthStats, WEEK_START } from "./journalCalendar";

describe("journal calendar calculations", () => {
  it("groups by stored date string without timezone parsing and counts invalid or missing dates", () => {
    const trades = [
      { id: "late", date: "2026-03-01", pnl: 10, time: "23:59" },
      { id: "early", date: "2026-03-01", pnl: -2, time: "00:01" },
      { id: "missing", pnl: 3 },
      { id: "invalid", date: "2026-02-30", pnl: 5 },
    ];
    const result = groupTradesByDay(trades);
    expect(result.byDate["2026-03-01"].map(({ id }) => id)).toEqual(["late", "early"]);
    expect(result.missingDateCount).toBe(2);
  });

  it("calculates wins, losses and flat days, including absent P&L", () => {
    expect(dayStats([{ pnl: 10 }, { pnl: -4 }, { pnl: 0 }, {}])).toEqual({
      count: 4, netPnl: 6, wins: 1, losses: 1, status: "win",
    });
    expect(dayStats([{ pnl: -2 }]).status).toBe("loss");
    expect(dayStats([{ pnl: 2 }, { pnl: -2 }]).status).toBe("flat");
    expect(dayStats([])).toEqual({ count: 0, netPnl: 0, wins: 0, losses: 0, status: "flat" });
    expect(dayStats([{ pnl: "not-number" }]).netPnl).toBe(0);
  });

  it("summarizes trading days, win-day rate, best and worst days", () => {
    const stats = monthStats([
      { date: "2026-01-01", count: 2, netPnl: 120 },
      { date: "2026-01-02", count: 1, netPnl: -85 },
      { date: "2026-01-03", count: 1, netPnl: 0 },
      { date: "2026-01-04", count: 0, netPnl: 0 },
    ]);
    expect(stats).toMatchObject({
      netPnl: 35,
      tradingDays: 3,
      greenDays: 1,
      redDays: 1,
      bestDay: { date: "2026-01-01", count: 2, netPnl: 120 },
      worstDay: { date: "2026-01-02", count: 1, netPnl: -85 },
    });
    expect(stats.winDayRate).toBeCloseTo(100 / 3);
    expect(monthStats([])).toMatchObject({
      netPnl: 0, tradingDays: 0, greenDays: 0, redDays: 0, winDayRate: 0, bestDay: null, worstDay: null,
    });
  });

  it("builds six Sunday-first weeks for all month lengths, including leap February", () => {
    expect(WEEK_START).toBe(0);
    for (let weekday = 0; weekday < 7; weekday += 1) {
      let firstOfMonth;
      for (let year = 2024; !firstOfMonth && year <= 2030; year += 1) {
        for (let month = 0; month < 12; month += 1) {
          const candidate = new Date(year, month, 1);
          if (candidate.getDay() === weekday) {
            firstOfMonth = candidate;
            break;
          }
        }
      }
      const cells = buildMonthGrid(firstOfMonth.getFullYear(), firstOfMonth.getMonth());
      expect(cells).toHaveLength(42);
      expect(cells.findIndex((cell) => cell.inMonth)).toBe(weekday);
      expect(cells.find((cell) => cell.inMonth).day).toBe(1);
    }
    expect(buildMonthGrid(2026, 1).filter((cell) => cell.inMonth)).toHaveLength(28);
    expect(buildMonthGrid(2024, 1).filter((cell) => cell.inMonth)).toHaveLength(29);
    expect(buildMonthGrid(2026, 3).filter((cell) => cell.inMonth)).toHaveLength(30);
    expect(buildMonthGrid(2026, 0).filter((cell) => cell.inMonth)).toHaveLength(31);
  });
});
