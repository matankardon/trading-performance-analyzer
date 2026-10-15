import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PriceChart from "./PriceChart";

const { charts, markerCalls, series, createChart } = vi.hoisted(() => ({
  charts: [],
  markerCalls: [],
  series: {
    setData: vi.fn(),
    createPriceLine: vi.fn(),
    priceToCoordinate: vi.fn((price) => Number(price)),
  },
  createChart: vi.fn(),
}));

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: class CandlestickSeries {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Magnet: "magnet" },
  HistogramSeries: class HistogramSeries {},
  LineSeries: class LineSeries {},
  LineStyle: { Dashed: 2 },
  createChart,
  createSeriesMarkers: vi.fn((_series, markers) => markerCalls.push(markers)),
}));

function makeChart() {
  const chart = {
    addSeries: vi.fn(() => series),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    remove: vi.fn(),
  };
  charts.push(chart);
  return chart;
}

describe("PriceChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    charts.length = 0;
    markerCalls.length = 0;
    createChart.mockImplementation(makeChart);
  });

  it("draws the directional entry marker and journaled price lines", () => {
    const bars = [
      { timestamp: Date.UTC(2025, 0, 2, 12), open: 100, high: 106, low: 98, close: 104, volume: 10 },
      { timestamp: Date.UTC(2025, 0, 2, 12, 15), open: 104, high: 108, low: 101, close: 107, volume: 12 },
    ];
    render(<PriceChart bars={bars} trade={{
      date: "2025-01-02",
      direction: "Long",
      entry: 103,
      exit: 107,
      stopLoss: 98,
      takeProfit: 115,
      pnl: 40,
      entryTimestamp: bars[0].timestamp,
    }} />);

    expect(screen.getByLabelText("Trade historical price chart")).toBeInTheDocument();
    expect(markerCalls[0]).toEqual([expect.objectContaining({
      time: Math.floor(bars[0].timestamp / 1000),
      position: "belowBar",
      shape: "arrowUp",
      color: "#78c995",
      text: "Entry",
    })]);
    expect(series.createPriceLine.mock.calls.map(([line]) => line.title)).toEqual([
      "Entry",
      "Exit",
      "Stop loss",
      "Target",
    ]);
  });
});
