import { describe, expect, it } from "vitest";
import { bandFromScore, computeSetupScore, matchingTrades, missingRequired } from "./setupChecklist";

const version = {
  id: "v1",
  conditions: { liquiditySweep: true, mss: true, smaConfirmation: true },
  requiredConditions: ["liquiditySweep"],
};

describe("setupChecklist", () => {
  it("computes a weighted score and handles an empty strategy", () => {
    expect(computeSetupScore(version, ["liquiditySweep"], { liquiditySweep: 3, mss: 1, smaConfirmation: 2 }))
      .toMatchObject({ score: 50, met: 1, total: 3 });
    expect(computeSetupScore({ conditions: {} }, [])).toMatchObject({ score: 0, total: 0 });
  });

  it("forces the Not ready band when a required declared item is missing", () => {
    expect(missingRequired(version, ["mss"])).toEqual([{ key: "liquiditySweep", label: "Liquidity Sweep" }]);
    expect(bandFromScore(100, true)).toBe("Not ready");
    expect(bandFromScore(80)).toBe("Ready");
    expect(bandFromScore(60)).toBe("Partial");
    expect(bandFromScore(20)).toBe("Not ready");
  });

  it("matches only trades of the selected version that include every ticked condition", () => {
    const trades = [
      { strategyVersionId: "v1", liquiditySweep: true, indicators: ["SMA"], pnl: 20 },
      { strategy_version_id: "v1", liquiditySweep: true, indicators: [], pnl: -5 },
      { strategyVersionId: "v2", liquiditySweep: true, indicators: ["SMA"], pnl: 50 },
    ];
    expect(matchingTrades(trades, "v1", ["liquiditySweep", "SMA"])).toEqual([trades[0]]);
    expect(matchingTrades(trades, "v1", [])).toHaveLength(2);
    expect(matchingTrades([], "v1", ["mss"])).toEqual([]);
  });
});
