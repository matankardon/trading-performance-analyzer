import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DayTradingDashboard from "./DayTradingDashboard";
import { useMarketData } from "../services/useMarketData";
import { computeMarketScore, keyLevels } from "../services/marketScore";

vi.mock("../services/useMarketData", () => ({
  MARKET_DATA_SOURCE: "Massive via historical-data",
  MARKET_TIMEFRAMES: ["15m", "1h", "4h", "1d"],
  useMarketData: vi.fn(),
}));

function readyMarket() {
  const components = [
    { key: "trend", label: "Trend", score: 91, direction: 1, available: true, value: "EMA20 110, EMA50 108, EMA200 103; slope 1.2 ATR", explanation: "The EMAs are aligned upward." },
    { key: "structure", label: "Structure", score: 90, direction: 1, available: true, value: "HH 3, HL 3", explanation: "Recent pivots are rising." },
    { key: "momentum", label: "Momentum", score: 85, direction: 1, available: true, value: "RSI14 60, MACD histogram 0.2", explanation: "Momentum is aligned." },
    { key: "volatility", label: "Volatility", score: 72, direction: null, available: true, value: "ATR14 1.2 (0.4%), 50th percentile", explanation: "Volatility is mid-range." },
    { key: "volume", label: "Volume", score: 100, direction: null, available: true, value: "Relative volume 1.2x", explanation: "Volume is near average." },
  ];
  return {
    status: "ready",
    bars: [],
    result: {
      available: true,
      score: 87.2,
      band: "Favorable",
      bias: "Bullish",
      biasDetail: { trend: 1, structure: 1, momentum: 1 },
      components,
      reasons: ["Environment quality for short-term trading; this is not a price forecast."],
    },
    levels: {
      previousDayHigh: 110,
      previousDayLow: 105,
      previousDayClose: 108,
      currentDayOpen: 109,
      currentDayHigh: 112,
      currentDayLow: 107,
      latestSwingHigh: 111,
      latestSwingLow: 106,
      atr14: 1.2,
      dayBoundary: "UTC",
    },
    latest: { price: 110, change: 1.25, changePercent: 1.15, timestamp: Date.UTC(2025, 0, 2, 15) },
    lastBar: Date.UTC(2025, 0, 2, 15),
    source: "Massive via historical-data · AAPL",
    providerSymbol: "AAPL",
    cached: false,
    error: "",
    triedSymbols: ["AAPL"],
    refresh: vi.fn(),
  };
}

describe("DayTradingDashboard market screens", () => {
  beforeEach(() => {
    localStorage.clear();
    useMarketData.mockReset();
    useMarketData.mockReturnValue(readyMarket());
  });

  it("shows the historical loading skeleton", () => {
    useMarketData.mockReturnValue({ ...readyMarket(), status: "loading" });
    render(<DayTradingDashboard page="Overview" selectedAsset="AAPL" />);

    expect(screen.getByRole("status", { name: "Loading historical market data" })).toBeInTheDocument();
    expect(screen.getByText(/Last bar:.*historical bars/)).toBeInTheDocument();
  });

  it("renders the real error message and a working Retry action", () => {
    const refresh = vi.fn();
    useMarketData.mockReturnValue({ ...readyMarket(), status: "error", error: "Provider connection failed.", refresh });
    render(<DayTradingDashboard page="Overview" selectedAsset="AAPL" />);

    expect(screen.getByText("Provider connection failed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("renders the no-data state and Chart tab link", () => {
    const onPageChange = vi.fn();
    useMarketData.mockReturnValue({ ...readyMarket(), status: "nodata" });
    render(<DayTradingDashboard page="Markets" selectedAsset="MISSING" onPageChange={onPageChange} />);

    expect(screen.getByText("No data for this symbol on the current data plan")).toBeInTheDocument();
    expect(screen.getByText(/SPY, QQQ, AAPL, EURUSD/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Chart tab" }));
    expect(onPageChange).toHaveBeenCalledWith("Chart");
  });

  it("renders the measured score and expandable evergreen explanations without live claims", () => {
    render(<DayTradingDashboard page="Overview" selectedAsset="AAPL" />);

    expect(screen.getByText("87.2 / 100 · Favorable")).toBeInTheDocument();
    expect(screen.getByText("Based on 5 of 5 components")).toBeInTheDocument();
    expect(screen.getByText("EMA20 110, EMA50 108, EMA200 103; slope 1.2 ATR")).toBeInTheDocument();
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Trend"));
    fireEvent.click(screen.getAllByText("What does it mean?")[0]);
    expect(screen.getByText(/Compares EMA20, EMA50, and EMA200 alignment/)).toBeInTheDocument();
  });

  it("renders a score computed from deterministic historical fixture bars", () => {
    const bars = Array.from({ length: 250 }, (_, index) => {
      const close = 100 + index * 0.15 + Math.sin(index * Math.PI / 2 + Math.PI) * 0.5;
      return {
        timestamp: Date.UTC(2025, 0, 1) + index * 3_600_000,
        open: close,
        high: close + 0.2,
        low: close - 0.2,
        close,
        volume: 1000,
      };
    });
    const result = computeMarketScore(bars, { timeframe: "1h" });
    useMarketData.mockReturnValue({
      ...readyMarket(),
      bars,
      result,
      levels: keyLevels(bars),
      latest: { price: bars.at(-1).close, change: 0.1, changePercent: 0.1, timestamp: bars.at(-1).timestamp },
      lastBar: bars.at(-1).timestamp,
      source: "Massive via historical-data · AAPL",
    });
    render(<DayTradingDashboard page="Overview" selectedAsset="AAPL" />);

    expect(screen.getByText(`${result.score} / 100 · ${result.band}`)).toBeInTheDocument();
    expect(screen.getByText(`Based on ${result.components.filter(({ available }) => available).length} of 5 components`)).toBeInTheDocument();
  });

  it("uses the latest saved checklist and links to Strategy when none is persisted", async () => {
    const strategyLibrary = [{
      id: "strategy-1",
      name: "Opening range",
      versions: [{
        id: "version-1",
        version: 2,
        conditions: { liquiditySweep: true, mss: true, smaConfirmation: true },
      }],
    }];

    const { rerender } = render(
      <DayTradingDashboard page="Overview" selectedAsset="AAPL" strategyLibrary={strategyLibrary} />,
    );
    expect(screen.getByText(/No saved checklist/)).toBeInTheDocument();
    const onPageChange = vi.fn();
    rerender(
      <DayTradingDashboard page="Overview" selectedAsset="AAPL" strategyLibrary={strategyLibrary} onPageChange={onPageChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run your checklist in the Strategy tab" }));
    expect(onPageChange).toHaveBeenCalledWith("Strategy");

    localStorage.setItem("tradeCatalystSetupChecklist", JSON.stringify({
      __lastUsedVersionId: "version-1",
      "version-1": { checked: { liquiditySweep: true, mss: true } },
    }));
    rerender(
      <DayTradingDashboard page="Overview" selectedAsset="AAPL" strategyLibrary={[...strategyLibrary]} />,
    );
    await waitFor(() => expect(screen.getByText("2 of 3 conditions · Partial")).toBeInTheDocument());
    expect(screen.getByText("Opening range · v2")).toBeInTheDocument();
  });

  it("shows score, component detail, UTC levels, and honest cross-market state in Markets", () => {
    render(<DayTradingDashboard page="Markets" selectedAsset="AAPL" />);

    expect(screen.getByText("Evidence from the selected historical bars")).toBeInTheDocument();
    expect(screen.getByText("Previous-day high")).toBeInTheDocument();
    expect(screen.getByText(/UTC day boundaries/)).toBeInTheDocument();
    expect(screen.getByText("Not connected yet. No related-asset values are inferred.")).toBeInTheDocument();
  });
});
