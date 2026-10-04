import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import TradeLog from "./TradeLog";

const { addSeries, createChart, createPriceLine, setData, createSeriesMarkers } = vi.hoisted(() => ({
  addSeries: vi.fn(),
  createChart: vi.fn(),
  createPriceLine: vi.fn(),
  setData: vi.fn(),
  createSeriesMarkers: vi.fn(),
}));

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "Candlestick",
  ColorType: { Solid: "solid" },
  CrosshairMode: { Magnet: 1 },
  LineStyle: { Dashed: 2 },
  createChart,
  createSeriesMarkers,
}));

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
  entryReasoning: {
    signalIndex: 11,
    entryIndex: 12,
    gates: { liquiditySweep: true, mss: true, fvg: true, orderBlock: true, stochasticConfirmation: true },
    liquiditySweep: { index: 8, timestamp: bars[8].timestamp, type: "low", sweptLevel: 106, confirmedAt: 8 },
    mss: { index: 10, timestamp: bars[10].timestamp, type: "bullish", brokenLevel: 111, confirmedAt: 10 },
    zones: [{ kind: "FVG", index: 10, confirmedAt: 11, top: 112, bottom: 110 }],
    stochastic: { index: 12, timestamp: bars[12].timestamp, k: 28.5, d: 22.25 },
  },
};

const secondTrade = { ...trade, entryIndex: 18, exitIndex: 20, entryTimestamp: bars[18].timestamp, exitTimestamp: bars[20].timestamp, pnl: -12, exitReason: "stop_loss" };

describe("TradeLog chart drill-down", () => {
  beforeEach(() => {
    addSeries.mockReset();
    createChart.mockReset();
    createPriceLine.mockReset();
    setData.mockReset();
    createSeriesMarkers.mockReset();
    const priceSeries = {
      setData,
      createPriceLine,
      priceToCoordinate: (price) => 300 - price,
    };
    addSeries.mockReturnValue(priceSeries);
    const timeScale = {
      fitContent: vi.fn(),
      timeToCoordinate: (time) => Number(time) / 1000,
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
      subscribeSizeChange: vi.fn(),
      unsubscribeSizeChange: vi.fn(),
    };
    const removeChart = vi.fn();
    createChart.mockReturnValue({
      addSeries,
      timeScale: () => timeScale,
      applyOptions: vi.fn(),
      remove: removeChart,
    });
    createChart.removeChart = removeChart;
    createSeriesMarkers.mockReturnValue({ setMarkers: vi.fn() });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses Lightweight Charts with native pan/zoom and supplied bars, opens one trade at a time, and closes on Escape", () => {
    render(<TradeLog trades={[trade, secondTrade]} bars={bars} asset="AAPL" />);

    expect(screen.queryByRole("region", { name: "AAPL trade chart" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "View chart" })[0]);

    expect(screen.getByRole("region", { name: "AAPL trade chart" })).toBeInTheDocument();
    expect(screen.getByText("TRADE ON CHART")).toBeInTheDocument();
    expect(setData).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ open: 105, high: 107, low: 104, close: 106 })]));
    expect(createChart.mock.calls[0][1].handleScroll.pressedMouseMove).toBe(true);
    expect(createChart.mock.calls[0][1].handleScale).toMatchObject({ mouseWheel: true, pinch: true });
    expect(createPriceLine).toHaveBeenCalledTimes(2);
    expect(createSeriesMarkers.mock.calls[0][1].map(({ text }) => text)).toEqual(expect.arrayContaining(["Entry", "TP exit", "Sweep 106.00"]));
    expect(screen.getByText("MSS 111.00")).toBeInTheDocument();
    expect(screen.getByText("FVG")).toBeInTheDocument();
    expect(screen.getByText("%K 28.50 / %D 22.25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View chart" }));
    expect(screen.getAllByRole("region", { name: "AAPL trade chart" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "AAPL trade chart" })).toHaveClass("outcome-loss");
    expect(screen.getByText("-$12.00")).toBeInTheDocument();
    expect(document.querySelector(".trade-outcome-loss .trade-pnl-loss")).toBeInTheDocument();
    expect(createChart).toHaveBeenCalledTimes(2);
    expect(createChart.removeChart).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "AAPL trade chart" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "View chart" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "AAPL trade chart" })).not.toBeInTheDocument();
  });
});
