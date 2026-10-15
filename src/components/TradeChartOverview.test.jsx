import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TradeChartOverview from "./TradeChartOverview";
import { fetchMarketBars } from "../services/useMarketData";

vi.mock("../services/useMarketData", () => ({ fetchMarketBars: vi.fn() }));
vi.mock("./PriceChart", () => ({
  default: ({ bars }) => <div aria-label="Mock price chart">{bars.length} bars</div>,
}));
vi.mock("../services/tradeChartIndicators", () => ({
  tradeIndicatorComputations: vi.fn(() => []),
}));

function trade(overrides = {}) {
  return {
    id: "trade-a",
    asset: "AAPL",
    date: "2025-01-02",
    time: "12:00:00",
    timeframe: "15m",
    direction: "Long",
    entry: 100,
    exit: 110,
    stopLoss: 95,
    takeProfit: 115,
    pnl: 50,
    ...overrides,
  };
}

describe("TradeChartOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchMarketBars.mockResolvedValue({ bars: [] });
  });

  it("shows a loading skeleton and then the journaled levels when bars are unavailable", async () => {
    let resolveFetch;
    fetchMarketBars.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    render(<TradeChartOverview trade={trade()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading historical bars");
    resolveFetch({ bars: [] });
    expect(await screen.findByRole("heading", { name: "Trade levels" })).toBeInTheDocument();
    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("Exit")).toBeInTheDocument();
    expect(screen.getByText(/No price bars for this symbol on your data plan/)).toBeInTheDocument();
  });

  it("shows provider errors with Retry", async () => {
    fetchMarketBars.mockRejectedValueOnce(new Error("Historical provider rejected the request."));
    render(<TradeChartOverview trade={trade()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Historical provider rejected the request.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMarketBars).toHaveBeenCalledTimes(2));
  });

  it("offers a typo suggestion and persists only the user's explicit mapping", async () => {
    render(<TradeChartOverview trade={trade({ asset: "xaussd" })} />);
    expect(screen.getByText('Unrecognized asset "xaussd".')).toBeInTheDocument();
    expect(fetchMarketBars).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Did you mean XAUUSD?" }));
    await waitFor(() => expect(fetchMarketBars).toHaveBeenCalledWith(
      "XAUUSD",
      "15m",
      expect.objectContaining({ startDate: "2025-01-01", endDate: "2025-01-03" }),
    ));
    expect(JSON.parse(localStorage.getItem("tradeCatalystChartSymbolMap"))).toEqual({ xaussd: "XAUUSD" });
  });

  it("displays loaded bars and the trade outcome/R:R legend", async () => {
    fetchMarketBars.mockResolvedValueOnce({
      bars: [{
        timestamp: Date.UTC(2025, 0, 2, 12),
        open: 100,
        high: 111,
        low: 95,
        close: 108,
        volume: 12,
      }],
    });
    render(<TradeChartOverview trade={trade()} />);
    expect(await screen.findByLabelText("Mock price chart")).toHaveTextContent("1 bars");
    expect(screen.getByText("R:R 3:1")).toBeInTheDocument();
    expect(screen.getByText("+$50.00")).toBeInTheDocument();
  });
});
