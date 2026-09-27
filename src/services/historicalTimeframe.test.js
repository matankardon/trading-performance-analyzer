import {
  buildMassiveAggregateUrl,
  massiveAggregateResultLimit,
  parseTimeframe,
  supportedHistoricalTimeframes,
} from "../../supabase/functions/_shared/timeframe";

describe("historical data timeframe mapping", () => {
  it.each([
    ["1m", 1, "minute"],
    ["5m", 5, "minute"],
    ["15m", 15, "minute"],
    ["1h", 1, "hour"],
    ["4h", 4, "hour"],
    ["1d", 1, "day"],
    ["1w", 1, "week"],
  ])("maps %s to multiplier %i and %s", (value, multiplier, timespan) => {
    expect(parseTimeframe(value)).toEqual({ multiplier, timespan });
  });

  it("keeps the dropdown values identical to the tested parser values", () => {
    expect(supportedHistoricalTimeframes.map(({ value }) => value)).toEqual([
      "1m", "5m", "15m", "1h", "4h", "1d", "1w",
    ]);
  });

  it("constructs the exact Massive 5m request URL and requests the documented maximum page size", () => {
    const url = buildMassiveAggregateUrl("AAPL", "5m", "2025-01-01", "2026-08-23");

    expect(url.toString()).toBe(
      "https://api.massive.com/v2/aggs/ticker/AAPL/range/5/minute/2025-01-01/2026-08-23?adjusted=true&sort=asc&limit=50000",
    );
    expect(massiveAggregateResultLimit).toBe(50000);
  });

  it.each(["5 min", "5M", "1mo", "60m", "", "5 minutes"]) (
    "rejects unrecognized timeframe %j with a clear supported-values message",
    (value) => {
      expect(() => parseTimeframe(value)).toThrow(/Unsupported timeframe.*1m, 5m, 15m, 1h, 4h, 1d, 1w/);
    },
  );
});