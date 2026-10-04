import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import TradeChart from "./TradeChart";

const chartApi = {
  addSeries: vi.fn(),
  timeScale: vi.fn(() => ({
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
    subscribeSizeChange: vi.fn(),
    unsubscribeSizeChange: vi.fn(),
    timeToCoordinate: vi.fn(() => 120),
  })),
  remove: vi.fn(),
};

const seriesApi = {
  setData: vi.fn(),
  createPriceLine: vi.fn(),
  priceToCoordinate: vi.fn(() => 140),
};

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: class CandlestickSeries {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Magnet: "magnet" },
  LineStyle: { Dashed: 2 },
  createChart: vi.fn(() => chartApi),
  createSeriesMarkers: vi.fn(),
}));

describe("TradeChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chartApi.addSeries.mockReturnValue(seriesApi);
  });

  it("uses the v5 candlestick API and passes real candle data into the series", () => {
    const bars = Array.from({ length: 25 }, (_, index) => ({
      timestamp: 1720000000000 + index * 60000,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index + 1,
    }));

    let rendered;
    expect(() => {
      rendered = render(
        <TradeChart
        bars={bars}
        trade={{
          direction: "long",
          entryIndex: 10,
          exitIndex: 18,
          entryTimestamp: bars[10].timestamp,
          exitTimestamp: bars[18].timestamp,
          entryPrice: 110,
          stopLoss: 108,
          takeProfit: 118,
          pnl: 120,
          exitReason: "take_profit",
          entryReasoning: {
            liquiditySweep: { type: "low", sweptLevel: 108, timestamp: bars[11].timestamp },
            zones: [{ kind: "FVG", index: 12, top: 112, bottom: 110 }],
            stochastic: { k: 70, d: 68 },
          },
        }}
        asset="AAPL"
        onClose={() => {}}
        />,
      );
    }).not.toThrow();

    expect(screen.getByText("TRADE ON CHART")).toBeInTheDocument();
    expect(chartApi.addSeries).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        upColor: expect.any(String),
        downColor: expect.any(String),
      }),
    );
    expect(seriesApi.setData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          time: expect.any(Number),
          open: expect.any(Number),
          high: expect.any(Number),
          low: expect.any(Number),
          close: expect.any(Number),
        }),
      ]),
    );
  });
});
