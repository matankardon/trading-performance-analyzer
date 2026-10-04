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
});