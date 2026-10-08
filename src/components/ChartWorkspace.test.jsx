import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChartWorkspace from "./ChartWorkspace";
import { fetchHistoricalBars } from "../services/historicalDataService";

const { charts, markerCalls, series, createChartMock } = vi.hoisted(() => ({
  charts: [],
  markerCalls: [],
  series: {
    setData: vi.fn(),
    createPriceLine: vi.fn(),
  },
  createChartMock: vi.fn(),
}));

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: class CandlestickSeries {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Magnet: "magnet" },
  HistogramSeries: class HistogramSeries {},
  LineSeries: class LineSeries {},
  LineStyle: { Dashed: 2 },
  createChart: createChartMock,
  createSeriesMarkers: vi.fn((_series, markers) => markerCalls.push(markers)),
}));

vi.mock("../services/historicalDataService", () => ({
  fetchHistoricalBars: vi.fn(),
  historicalAssetSuggestions: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "SPY", "QQQ"],
}));

function sampleBars() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [
    { timestamp: Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 13), open: 100, high: 105, low: 98, close: 103, volume: 500 },
    { timestamp: Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 14), open: 103, high: 108, low: 102, close: 107, volume: 700 },
    { timestamp: Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 13), open: 107, high: 109, low: 104, close: 105, volume: 600 },
  ];
}

function createMockChart() {
  const timeScale = {
    fitContent: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => null),
    setVisibleLogicalRange: vi.fn(),
  };
  const chart = {
    addSeries: vi.fn(() => series),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    timeScale: vi.fn(() => timeScale),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    subscribeClick: vi.fn((handler) => { chart.clickHandler = handler; }),
    unsubscribeClick: vi.fn(),
    remove: vi.fn(),
  };
  charts.push(chart);
  return chart;
}

function sampleTrade(overrides = {}) {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    id: "trade-1",
    asset: "AAPL",
    date,
    direction: "Long",
    entry: 100,
    exit: 107,
    stopLoss: 95,
    takeProfit: 115,
    pnl: 70,
    strategy: "Momentum",
    versionNumber: 2,
    ...overrides,
  };
}

describe("ChartWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    charts.length = 0;
    markerCalls.length = 0;
    localStorage.clear();
    createChartMock.mockImplementation(createMockChart);
    fetchHistoricalBars.mockResolvedValue(sampleBars());
  });

  it("shows loading, then real chart content, and reports provider errors with Retry", async () => {
    fetchHistoricalBars.mockRejectedValueOnce(new Error("Historical provider is unavailable."));
    render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading historical bars");
    expect(await screen.findByRole("alert")).toHaveTextContent("Historical provider is unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByLabelText("Historical candlestick chart")).toBeInTheDocument());
    expect(fetchHistoricalBars).toHaveBeenCalledTimes(2);
  });

  it("shows the provider's empty-range state", async () => {
    fetchHistoricalBars.mockResolvedValue([]);
    render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(await screen.findByText("No bars in this range")).toBeInTheDocument();
  });

  it("opens the existing trade detail flow from a clicked chart marker and toggles journal markers", async () => {
    const onViewTrade = vi.fn();
    render(<ChartWorkspace selectedAsset="AAPL" trades={[sampleTrade()]} onViewTrade={onViewTrade} />);
    await waitFor(() => expect(screen.getByLabelText("Historical candlestick chart")).toBeInTheDocument());
    expect(markerCalls.at(-1)).toHaveLength(2);
    const chart = charts[0];
    chart.clickHandler({ time: Math.floor(sampleBars()[0].timestamp / 1000) });
    expect(onViewTrade).toHaveBeenCalledWith(expect.objectContaining({ id: "trade-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "My trades" }));
    await waitFor(() => expect(markerCalls.at(-1)).toEqual([]));
    expect(screen.getByText("Trades on this chart")).toBeInTheDocument();
  });

  it("keeps the trade list visible when markers are hidden and centers on a selected trade", async () => {
    render(<ChartWorkspace selectedAsset="AAPL" trades={[sampleTrade()]} />);
    await waitFor(() => expect(screen.getByLabelText("Historical candlestick chart")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "My trades" }));
    expect(screen.getByRole("button", { name: /Momentum · v2/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Momentum · v2/ }));
    await waitFor(() => expect(charts.at(-1).timeScale().setVisibleLogicalRange).toHaveBeenCalled());
  });

  it("explains an unsupported stored timeframe instead of requesting it", () => {
    localStorage.setItem("tradeCatalystChartSelection", JSON.stringify({ symbol: "AAPL", timeframe: "2h" }));
    render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(screen.getByRole("alert")).toHaveTextContent('Unsupported timeframe "2h".');
    expect(screen.getByRole("alert")).toHaveTextContent("1m, 5m, 15m, 1h, 4h, 1d, 1w");
    expect(fetchHistoricalBars).not.toHaveBeenCalled();
  });
});
