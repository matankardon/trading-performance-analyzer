import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JournalCalendar from "./JournalCalendar";

const tradeSet = [
  { id: "1", date: "2026-10-08", asset: "GOLD", pnl: 150 },
  { id: "2", date: "2026-10-08", asset: "EURUSD", pnl: -30 },
  { id: "3", date: "2026-10-12", asset: "AAPL", pnl: -85 },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderCalendar(trades = tradeSet) {
  const props = {
    trades,
    onAddTrade: vi.fn(),
    onViewTrade: vi.fn(),
    onEditTrade: vi.fn(),
    onDeleteTrade: vi.fn(),
  };
  return { ...render(<JournalCalendar {...props} />), props };
}

describe("JournalCalendar", () => {
  it("colors days by net result and uses signed values in accessible labels", () => {
    renderCalendar();
    const winDay = screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" });
    const lossDay = screen.getByRole("gridcell", { name: "Oct 12, 1 trade, net -$85.00" });
    expect(winDay).toHaveClass("status-win");
    expect(lossDay).toHaveClass("status-loss");
    expect(within(winDay).getByText("+$120")).toBeInTheDocument();
  });

  it("opens the selected day's panel with only that day's trades", () => {
    const { props } = renderCalendar();
    fireEvent.click(screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" }));
    const panel = screen.getByRole("dialog", { name: /Thursday, October 8, 2026/i });
    expect(within(panel).getByText("GOLD")).toBeInTheDocument();
    expect(within(panel).getByText("EURUSD")).toBeInTheDocument();
    expect(within(panel).queryByText("AAPL")).not.toBeInTheDocument();
    expect(props.onEditTrade).not.toHaveBeenCalled();
  });

  it("aggregates only the trades supplied by active journal filters", () => {
    renderCalendar([tradeSet[0]]);
    const filteredDay = screen.getByRole("gridcell", { name: "Oct 8, 1 trade, net +$150.00" });
    expect(filteredDay).toHaveClass("status-win");
    expect(screen.queryByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" })).not.toBeInTheDocument();
  });

  it("navigates months and Today returns to the current month", () => {
    renderCalendar([]);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
  });

  it("moves focus by day with arrow keys and closes the panel with Escape", () => {
    renderCalendar();
    const todayCell = screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" });
    todayCell.focus();
    fireEvent.keyDown(todayCell, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAttribute("data-date", "2026-10-09");
    fireEvent.click(document.activeElement);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the empty-month state and prefills Add trade with the selected date", () => {
    const { props } = renderCalendar([]);
    fireEvent.click(screen.getByRole("gridcell", { name: "Oct 8, 0 trades, net $0.00" }));
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText("No trades on this day")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Add trade" }));
    expect(props.onAddTrade).toHaveBeenCalledWith("2026-10-08");
  });
});
