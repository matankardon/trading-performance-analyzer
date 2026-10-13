import { vi } from "vitest";
import { fetchHistoricalBars } from "./historicalDataService";

const { getSession, invoke } = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getSession },
    functions: { invoke },
  },
}));

describe("historical data service", () => {
  beforeEach(() => {
    getSession.mockReset();
    invoke.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
  });

  it("passes the selected date-range request to the Edge Function", async () => {
    invoke.mockResolvedValue({ data: { bars: [] }, error: null });

    await fetchHistoricalBars("AAPL", "15m", "2024-01-01", "2024-01-02");

    expect(invoke).toHaveBeenCalledWith("historical-data", {
      body: { asset: "AAPL", timeframe: "15m", startDate: "2024-01-01", endDate: "2024-01-02" },
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("turns an Edge Function 401 into a sign-in-again message", async () => {
    const response = new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), { status: 401 });
    invoke.mockResolvedValue({ data: null, error: { status: 401, context: response } });

    await expect(fetchHistoricalBars("AAPL", "15m", "2024-01-01", "2024-01-02"))
      .rejects.toThrow("Your session expired. Please sign in again.");
  });

  it("passes AbortSignal through to the Edge Function invocation", async () => {
    invoke.mockResolvedValue({ data: { bars: [] }, error: null });
    const controller = new AbortController();

    await fetchHistoricalBars("AAPL", "1h", "2024-01-01", "2024-01-02", { signal: controller.signal });

    expect(invoke).toHaveBeenCalledWith("historical-data", expect.objectContaining({
      signal: controller.signal,
      body: { asset: "AAPL", timeframe: "1h", startDate: "2024-01-01", endDate: "2024-01-02" },
    }));
  });

  it("preserves the historical provider error code for ticker fallbacks", async () => {
    const response = new Response(JSON.stringify({
      error: "MASSIVE_SYMBOL_NOT_FOUND",
      detail: "Massive symbol not found.",
    }), { status: 502 });
    invoke.mockResolvedValue({ data: null, error: { status: 502, context: response } });

    await expect(fetchHistoricalBars("C:EURUSD", "1h", "2024-01-01", "2024-01-02"))
      .rejects.toMatchObject({ code: "MASSIVE_SYMBOL_NOT_FOUND", message: "Massive symbol not found." });
  });
});