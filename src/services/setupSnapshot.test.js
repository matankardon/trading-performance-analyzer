import {
  normalizeSetupSnapshot,
  serializeSetupSnapshot,
} from "./setupSnapshot";

describe("setup snapshots", () => {
  it("keeps supported populated fields and omits empty or unknown values", () => {
    const snapshot = normalizeSetupSnapshot({
      symbol: "EURUSD",
      timeframe: "15m",
      setupScore: 0,
      liquidityLevels: [],
      entryZone: null,
      unknownField: "should not be serialized",
    });

    expect(snapshot).toEqual({
      symbol: "EURUSD",
      timeframe: "15m",
      setupScore: 0,
    });
  });

  it("serializes a normalized snapshot as readable JSON", () => {
    const serialized = serializeSetupSnapshot({
      symbol: "AAPL",
      direction: "Long",
      notes: "ignored",
    });

    expect(serialized).toBe(
      JSON.stringify({ symbol: "AAPL", direction: "Long" }, null, 2)
    );
  });
});