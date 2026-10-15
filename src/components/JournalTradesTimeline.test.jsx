import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import JournalTradesTimeline from "./JournalTradesTimeline";
import { buildJournalTimeline } from "../services/journalTimeline";

describe("JournalTradesTimeline", () => {
  it("plots profitable and losing trades and keeps an entry when the exit is missing", () => {
    const timeline = buildJournalTimeline([
      { date: "2025-01-02", direction: "Long", entry: 100, exit: 110, stopLoss: 95, takeProfit: 115, pnl: 50 },
      { date: "2025-01-03", direction: "Short", entry: 120, exit: null, stopLoss: 125, pnl: -15 },
    ]);

    expect(timeline.plottedTradeCount).toBe(2);
    expect(timeline.series).toEqual([{ key: "trade-0" }, { key: "trade-1" }]);
    expect(timeline.rows.map((row) => row["trade-0"] ?? row["trade-1"])).toEqual([100, 110, 120]);
    expect(timeline.references.map(({ label }) => label)).toEqual(["SL", "TP", "SL"]);
    expect(timeline.rows[0].trade).toEqual({ direction: "Long", pnl: 50 });
    expect(timeline.rows.at(-1).trade).toEqual({ direction: "Short", pnl: -15 });
  });

  it("has explicit empty and missing-entry states", () => {
    const { rerender } = render(<JournalTradesTimeline />);
    expect(screen.getByText("No journaled trades for this asset and date range.")).toBeInTheDocument();

    rerender(<JournalTradesTimeline trades={[{ date: "2025-01-02", exit: 105, pnl: 10 }]} />);
    expect(screen.getByText("Journaled trades are available, but entry prices are missing.")).toBeInTheDocument();
  });
});
