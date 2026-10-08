import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JournalCalendar from "./JournalCalendar";

const tradeSet = [
  {
    id: "1",
    date: "2026-10-08",
    asset: "GOLD",
    direction: "Long",
    session: "New York",
    strategy: "Momentum",
    versionNumber: 2,
    time: "09:30",
    tradeQuality: "Valid Setup",
    ruleBreak: true,
    pnl: 150,
  },
  { id: "2", date: "2026-10-08", asset: "EURUSD", pnl: -30 },
  { id: "3", date: "2026-10-12", asset: "AAPL", pnl: -85 },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderCalendar(trades = tradeSet, options = {}) {
  const props = {
    trades,
    loading: options.loading || false,
    onAddTrade: vi.fn(),
    onViewTrade: vi.fn(),
    onEditTrade: vi.fn(),
    onDeleteTrade: vi.fn(),
  };
  return { ...render(<JournalCalendar {...props} />), props };
}

describe("JournalCalendar", () => {
  it("shows skeleton cells during loading and reveals calendar content after it clears", () => {
    const { rerender, props } = renderCalendar([], { loading: true });
    expect(screen.getAllByRole("gridcell", { name: "Loading calendar day" })).toHaveLength(42);
    rerender(<JournalCalendar {...props} loading={false} trades={tradeSet} />);
    expect(screen.queryByRole("gridcell", { name: "Loading calendar day" })).not.toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" })).toBeInTheDocument();
  });

  it("shows loading skeleton while changing months and removes search inputs", () => {
    renderCalendar();
    expect(screen.queryByPlaceholderText(/search asset/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getAllByRole("gridcell", { name: "Loading calendar day" })).toHaveLength(42);
    act(() => vi.advanceTimersByTime(360));
    expect(screen.queryByRole("gridcell", { name: "Loading calendar day" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
  });

  it("colors days by net result and uses signed values in accessible labels", () => {
    renderCalendar();
    const winDay = screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" });
    const lossDay = screen.getByRole("gridcell", { name: "Oct 12, 1 trade, net -$85.00" });
    expect(winDay).toHaveClass("status-win");
    expect(lossDay).toHaveClass("status-loss");
    expect(within(winDay).getByText("+$120")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Week 2, 2 trades, net +$120.00" })).toBeInTheDocument();
  });

  it("assigns flat-day styling and always renders the English month title", () => {
    const originalToLocaleString = Date.prototype.toLocaleString;
    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function toLocaleString(locale, ...args) {
      return locale === "en-US"
        ? originalToLocaleString.call(this, locale, ...args)
        : "אוקטובר 2026";
    });
    vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function toLocaleDateString(locale, ...args) {
      return locale === "en-US"
        ? originalToLocaleDateString.call(this, locale, ...args)
        : "יום חמישי, 8 באוקטובר 2026";
    });
    renderCalendar([{ id: "flat", date: "2026-10-09", pnl: 0 }]);
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Oct 9, 1 trade, net $0.00" })).toHaveClass("status-flat");
    fireEvent.click(screen.getByRole("gridcell", { name: "Oct 9, 1 trade, net $0.00" }));
    expect(screen.getByRole("heading", { name: "Friday, October 9, 2026" })).toBeInTheDocument();
  });

  it("opens the selected day's panel with only that day's trades", () => {
    const { props } = renderCalendar();
    fireEvent.click(screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" }));
    const panel = screen.getByRole("dialog", { name: /Thursday, October 8, 2026/i });
    expect(within(panel).getByText("GOLD")).toBeInTheDocument();
    expect(within(panel).getByText("EURUSD")).toBeInTheDocument();
    expect(within(panel).queryByText("AAPL")).not.toBeInTheDocument();
    expect(props.onEditTrade).not.toHaveBeenCalled();
    expect(within(panel).getByRole("heading", { name: "Thursday, October 8, 2026" })).toBeInTheDocument();
    const row = within(panel).getByText("GOLD").closest("article");
    expect(row).toHaveTextContent("Long");
    expect(row).toHaveTextContent("New York · Momentum v2 · 09:30");
    expect(within(row).getByText("Valid Setup")).toBeInTheDocument();
    expect(within(row).getByText("Rule break")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("aggregates all trades supplied to the calendar", () => {
    renderCalendar();
    const day = screen.getByRole("gridcell", { name: "Oct 8, 2 trades, net +$120.00" });
    expect(day).toHaveClass("status-win");
    expect(screen.getByRole("gridcell", { name: "Oct 12, 1 trade, net -$85.00" })).toBeInTheDocument();
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
