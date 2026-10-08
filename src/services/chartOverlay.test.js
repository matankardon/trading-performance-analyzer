import { describe, expect, it } from "vitest";
import { priceLinesForTrade, tradesToMarkers } from "./chartOverlay";

const trades = [
  { id: "long", asset: "AAPL", date: "2026-10-08", direction: "Long", entry: 100, exit: 110, stopLoss: 95, takeProfit: 115, pnl: 10 },
  { id: "short", asset: "AAPL", date: "2026-10-09", direction: "Short", entry: 110, exit: 100, pnl: -10 },
  { id: "missing-exit", asset: "AAPL", date: "2026-10-08", entry: 100 },
  { id: "out-of-range", asset: "AAPL", date: "2026-11-01", entry: 1, exit: 2 },
  { id: "no-date", asset: "AAPL", date: "", entry: 1, exit: 2 },
];

describe("chartOverlay", () => {
  it("creates direction- and outcome-aware markers within the stored date range", () => {
    const result = tradesToMarkers(trades, "aapl", { startDate: "2026-10-08", endDate: "2026-10-09" });
    expect(result.trades.map(({ id }) => id)).toEqual(["long", "short"]);
    expect(result.markers).toHaveLength(4);
    expect(result.markers[0]).toMatchObject({ type: "entry", shape: "arrowUp", color: "#78c995", date: "2026-10-08" });
    expect(result.markers[2]).toMatchObject({ type: "entry", shape: "arrowDown", color: "#df858d" });
    expect(result.skippedCount).toBe(2);
  });

  it("returns only journaled stop and target lines and does not parse date strings as timestamps", () => {
    expect(priceLinesForTrade(trades[0])).toEqual([
      { price: 95, label: "Stop loss", color: "#df858d" },
      { price: 115, label: "Target", color: "#78c995" },
    ]);
    expect(tradesToMarkers([{ ...trades[0], date: "2026-10-08T23:59:00-08:00" }], "AAPL", {
      startDate: "2026-10-08",
      endDate: "2026-10-08",
    }).trades).toHaveLength(1);
  });
});
