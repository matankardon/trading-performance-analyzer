import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHistoricalBars } from "./historicalDataService";
import {
  clearMarketDataCache,
  fetchMarketBars,
  historicalDateRange,
  MARKET_DATA_CACHE_TTL,
  providerSymbolVariants,
  useMarketData,
} from "./useMarketData";

vi.mock("./historicalDataService", () => ({
  fetchHistoricalBars: vi.fn(),
}));

function makeBars(count = 250) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.2 + Math.sin(index * Math.PI / 2 + Math.PI) * 0.3;
    return {
      timestamp: Date.UTC(2025, 0, 1) + index * 3_600_000,
      open: close,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + index,
    };
  });
}

describe("useMarketData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    clearMarketDataCache();
    fetchHistoricalBars.mockResolvedValue(makeBars());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses provider-documented ticker prefixes for each supported asset class", () => {
    expect(providerSymbolVariants("AAPL")).toEqual(["AAPL"]);
    expect(providerSymbolVariants("EURUSD")).toEqual(["C:EURUSD", "EURUSD"]);
    expect(providerSymbolVariants("XAUUSD")).toEqual(["C:XAUUSD", "XAUUSD"]);
    expect(providerSymbolVariants("BTCUSD")).toEqual(["X:BTCUSD", "BTCUSD"]);
    expect(providerSymbolVariants("SPX")).toEqual(["I:SPX", "SPX"]);
  });

  it("requests at least 250-bar windows and ends the request on a completed UTC day", () => {
    expect(historicalDateRange("15m", new Date("2025-03-10T12:00:00Z"))).toEqual({
      startDate: "2025-01-08",
      endDate: "2025-03-09",
    });
    expect(historicalDateRange("1h").startDate).toBeTruthy();
  });

  it("uses its memory/session cache until the five-minute TTL expires", async () => {
    const now = Date.parse("2025-03-10T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const first = renderHook(() => useMarketData("AAPL", "1h"));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    const sessionCache = JSON.parse(sessionStorage.getItem("tradeCatalystMarketDataCache"));
    expect(Object.keys(sessionCache)).toContain("AAPL:1h");
    first.unmount();

    const cached = renderHook(() => useMarketData("AAPL", "1h"));
    await waitFor(() => expect(cached.result.current.status).toBe("ready"));
    expect(cached.result.current.cached).toBe(true);
    expect(fetchHistoricalBars).toHaveBeenCalledTimes(1);
    cached.unmount();

    Date.now.mockReturnValue(now + MARKET_DATA_CACHE_TTL + 1);
    const expired = renderHook(() => useMarketData("AAPL", "1h"));
    await waitFor(() => expect(fetchHistoricalBars).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(expired.result.current.status).toBe("ready"));
    expired.unmount();
  });

  it("tries the prefixed symbol before its documented unprefixed fallback", async () => {
    fetchHistoricalBars
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(makeBars());

    const payload = await fetchMarketBars("EURUSD", "15m");

    expect(fetchHistoricalBars.mock.calls.map(([asset]) => asset)).toEqual(["C:EURUSD", "EURUSD"]);
    expect(payload.providerSymbol).toBe("EURUSD");
    expect(payload.bars).toHaveLength(250);
  });

  it("continues to the same-instrument variant after a Massive symbol-not-found response", async () => {
    const notFound = new Error("No matching symbol.");
    notFound.code = "MASSIVE_SYMBOL_NOT_FOUND";
    fetchHistoricalBars.mockRejectedValueOnce(notFound).mockResolvedValueOnce(makeBars());

    const payload = await fetchMarketBars("EURUSD", "1h");

    expect(fetchHistoricalBars.mock.calls.map(([asset]) => asset)).toEqual(["C:EURUSD", "EURUSD"]);
    expect(payload.providerSymbol).toBe("EURUSD");
  });

  it("returns the no-data state when every symbol variant has no bars", async () => {
    fetchHistoricalBars.mockResolvedValue([]);
    const { result } = renderHook(() => useMarketData("AAPL", "1h"));

    await waitFor(() => expect(result.current.status).toBe("nodata"));
    expect(result.current.bars).toEqual([]);
  });

  it("surfaces provider errors and rate-limit messages", async () => {
    const error = new Error("Provider is busy.");
    error.code = "MASSIVE_RATE_LIMITED";
    fetchHistoricalBars.mockRejectedValue(error);
    const { result } = renderHook(() => useMarketData("AAPL", "1h"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Rate limit: Provider is busy.");
  });

  it("aborts an in-flight request when the hook unmounts", async () => {
    let requestSignal;
    fetchHistoricalBars.mockImplementation((asset, timeframe, start, end, { signal }) => {
      requestSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    const { unmount } = renderHook(() => useMarketData("AAPL", "1h"));
    await waitFor(() => expect(requestSignal).toBeDefined());
    unmount();

    expect(requestSignal.aborted).toBe(true);
  });

  it("uses Refresh to explicitly bypass a valid cache", async () => {
    const { result, unmount } = renderHook(() => useMarketData("AAPL", "1h"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.refresh());
    await waitFor(() => expect(fetchHistoricalBars).toHaveBeenCalledTimes(2));
    unmount();
  });
});
