import { describe, expect, it } from "vitest";
import { suggestKnownSymbol, tradeAssetSuggestions } from "./tradeAssetSuggestions";

describe("trade asset suggestions", () => {
  it("includes common instruments and assets already used in the journal", () => {
    const suggestions = tradeAssetSuggestions([{ asset: "MY CUSTOM TICKER" }, { asset: "AAPL" }]);
    expect(suggestions).toContain("MY CUSTOM TICKER");
    expect(suggestions).toContain("XAUUSD");
    expect(suggestions).toContain("EURUSD");
    expect(suggestions.filter((asset) => asset === "AAPL")).toHaveLength(1);
  });

  it("suggests a known ticker for a close typo without silently rewriting it", () => {
    expect(suggestKnownSymbol("xaussd")).toBe("XAUUSD");
    expect(suggestKnownSymbol("GOLD")).toBeNull();
    expect(suggestKnownSymbol("unrelated-symbol")).toBeNull();
  });
});
