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
    fireEvent.click(screen.getByRole("button", { name: "My trades" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading historical bars");
    expect(await screen.findByRole("alert")).toHaveTextContent("Historical provider is unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByLabelText("Historical candlestick chart")).toBeInTheDocument());
    expect(fetchHistoricalBars).toHaveBeenCalledTimes(2);
  });

  it("shows the provider's empty-range state", async () => {
    fetchHistoricalBars.mockResolvedValue([]);
    render(<ChartWorkspace selectedAsset="AAPL" />);
    fireEvent.click(screen.getByRole("button", { name: "My trades" }));
    expect(await screen.findByText("No bars in this range")).toBeInTheDocument();
  });

  it("opens the existing trade detail flow from a clicked chart marker and toggles journal markers", async () => {
    const onViewTrade = vi.fn();
    render(<ChartWorkspace selectedAsset="AAPL" trades={[sampleTrade()]} onViewTrade={onViewTrade} />);
    fireEvent.click(screen.getByRole("button", { name: "My trades" }));
    await waitFor(() => expect(screen.getByLabelText("Historical candlestick chart")).toBeInTheDocument());
    await waitFor(() => expect(markerCalls.at(-1)).toHaveLength(2));
    const chart = charts[0];
    chart.clickHandler({ time: Math.floor(sampleBars()[0].timestamp / 1000) });
    expect(onViewTrade).toHaveBeenCalledWith(expect.objectContaining({ id: "trade-1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Journal markers" }));
    await waitFor(() => expect(markerCalls.at(-1)).toEqual([]));
    expect(screen.getByRole("button", { name: /Trades on this chart ·/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the dropdown available when markers are hidden and centers on a selected trade", async () => {
    render(<ChartWorkspace selectedAsset="AAPL" trades={[sampleTrade()]} />);
    fireEvent.click(screen.getByRole("button", { name: "My trades" }));
    await waitFor(() => expect(screen.getByLabelText("Historical candlestick chart")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Journal markers" }));
    fireEvent.click(screen.getByRole("button", { name: /Trades on this chart ·/ }));
    expect(screen.getByText("Momentum · v2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    await waitFor(() => expect(charts.at(-1).timeScale().setVisibleLogicalRange).toHaveBeenCalled());
  });

  it("removes app-side ticker, timeframe, and mapping controls", () => {
    render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(screen.queryByRole("textbox", { name: "Symbol" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Timeframe" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Map to chart symbol/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chart symbol:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chart blank or/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Strategy" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Strategy version" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Chart view" })).toBeInTheDocument();
  });

  it("starts with TradingView and persists the view switch", async () => {
    const { unmount } = render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(screen.getByRole("button", { name: "TradingView" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(localStorage.getItem("tradeCatalystChartView")).toBe("tradingview"));
    fireEvent.click(screen.getByRole("button", { name: "My trades" }));
    await waitFor(() => expect(localStorage.getItem("tradeCatalystChartView")).toBe("my-trades"));
    unmount();
    render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(screen.getByRole("button", { name: "My trades" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows truthful study statuses in a compact row without a trade plan or checklist", () => {
    const strategy = {
      id: "momentum",
      name: "Momentum",
      versions: [{
        id: "momentum-v2",
        version: 2,
        conditions: { liquiditySweep: true, smaConfirmation: true },
      }],
    };
    render(<ChartWorkspace selectedAsset="AAPL" strategyLibrary={[strategy]} />);
    expect(screen.getByRole("combobox", { name: "Strategy" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Strategy version" })).toHaveValue("momentum-v2");
    expect(screen.getByText("SMA: Sent to chart")).toBeInTheDocument();
    expect(screen.getByText("Liquidity Sweep: Check manually")).toBeInTheDocument();
    expect(screen.getByText("If an indicator isn’t visible, add it with the chart’s Indicators button.")).toBeInTheDocument();
    expect(screen.getByText(/Drawings made on this chart are not saved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log this trade" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Trade plan entry")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Liquidity Sweep/ })).not.toBeInTheDocument();
  });

  it("explains manual-only strategies and opens Strategy Lab", () => {
    const onPageChange = vi.fn();
    const strategy = {
      id: "manual",
      name: "Manual",
      versions: [{ id: "manual-v1", version: 1, conditions: { liquiditySweep: true, mss: true } }],
    };
    render(<ChartWorkspace selectedAsset="AAPL" strategyLibrary={[strategy]} onPageChange={onPageChange} />);
    expect(screen.getByText("This strategy declares no chart indicators (only manual conditions). Add indicators in Strategy Lab to see them here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Strategy Lab" }));
    expect(onPageChange).toHaveBeenCalledWith("Strategy Lab");
  });

  it("shows an unverified id without sending it to the widget", () => {
    const strategy = {
      id: "ichimoku",
      name: "Ichimoku",
      versions: [{ id: "ichimoku-v1", version: 1, conditions: { ichimokuConfirmation: true } }],
    };
    render(<ChartWorkspace selectedAsset="AAPL" strategyLibrary={[strategy]} />);
    expect(screen.getByText("Ichimoku: Unverified id (STD;Ichimoku%Cloud)")).toBeInTheDocument();
    const script = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]');
    expect(JSON.parse(script.textContent).studies).toEqual([]);
  });

  it("filters trades by asset and closes its dropdown on Escape or outside click", async () => {
    const aaplTrade = sampleTrade({ pnl: 2345.5 });
    const otherTrade = sampleTrade({ id: "trade-2", asset: "MSFT", pnl: 100 });
    render(<ChartWorkspace selectedAsset="AAPL" trades={[aaplTrade, otherTrade]} />);
    const trigger = screen.getByRole("button", { name: /Trades on this chart ·/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("2 trades · net +$2,445.50");
    fireEvent.click(trigger);
    expect(screen.getByRole("combobox", { name: "Filter trades by asset" })).toHaveValue("all");
    expect(screen.getByText("2 trades · All assets")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter trades by asset" }), { target: { value: "MSFT" } });
    expect(screen.getByText("1 trades · MSFT")).toBeInTheDocument();
    expect(trigger).toHaveTextContent("1 trades · net +$100.00");
    expect(screen.getByText("Momentum · v2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("selecting a trade asset in My trades changes its chart symbol", async () => {
    const aaplTrade = sampleTrade();
    const msftTrade = sampleTrade({ id: "trade-msft", asset: "MSFT" });
    render(<ChartWorkspace selectedAsset="AAPL" trades={[aaplTrade, msftTrade]} />);
    fireEvent.click(screen.getByRole("button", { name: "My trades" }));
    await waitFor(() => expect(fetchHistoricalBars).toHaveBeenCalledWith(
      "AAPL",
      "15m",
      expect.any(String),
      expect.any(String),
    ));
    fireEvent.click(screen.getByRole("button", { name: /Trades on this chart ·/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter trades by asset" }), { target: { value: "MSFT" } });
    await waitFor(() => expect(fetchHistoricalBars).toHaveBeenCalledWith(
      "MSFT",
      "15m",
      expect.any(String),
      expect.any(String),
    ));
    expect(screen.getByRole("heading", { name: "MSFT · 15m" })).toBeInTheDocument();
  });

  it("does not remount the TradingView widget for dropdown-only state changes", () => {
    render(<ChartWorkspace selectedAsset="AAPL" trades={[sampleTrade(), sampleTrade({ id: "trade-msft", asset: "MSFT" })]} />);
    const script = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]');
    fireEvent.click(screen.getByRole("button", { name: /Trades on this chart ·/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter trades by asset" }), { target: { value: "MSFT" } });
    expect(document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]')).toBe(script);
  });

});
