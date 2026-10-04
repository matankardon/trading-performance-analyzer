import { fireEvent, render, screen } from "@testing-library/react";
import TradeLog from "./TradeLog";

const bars = Array.from({ length: 30 }, (_, index) => {
  const timestamp = Date.UTC(2025, 0, 2, 14, index * 5);
  const open = 100 + index;
  return { timestamp, open, high: open + 2, low: open - 1, close: open + 1, volume: 500 };
});
const trade = {
  direction: "long",
  entryIndex: 12,
  exitIndex: 16,
  entryTimestamp: bars[12].timestamp,
  exitTimestamp: bars[16].timestamp,
  entryPrice: 112.1,
  exitPrice: 116.5,
  stopLoss: 110,
  takeProfit: 120,
  exitReason: "take_profit",
  pnl: 44,
  barsHeld: 4,
};

describe("TradeLog chart drill-down", () => {
  it("opens and closes the selected trade chart using the supplied bars", () => {
    render(<TradeLog trades={[trade]} bars={bars} asset="AAPL" />);

    expect(screen.queryByRole("region", { name: "AAPL trade chart" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View chart" }));

    expect(screen.getByRole("region", { name: "AAPL trade chart" })).toBeInTheDocument();
    expect(screen.getByText("TRADE ON CHART")).toBeInTheDocument();
    expect(document.querySelectorAll(".trade-candle").length).toBeGreaterThan(0);
    expect(screen.getByText("SL 110.00")).toBeInTheDocument();
    expect(screen.getByText("TP 120.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close chart" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close chart" }));
    expect(screen.queryByRole("region", { name: "AAPL trade chart" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View chart" })).toBeInTheDocument();
  });
});
