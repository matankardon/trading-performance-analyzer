import { describe, expect, it } from "vitest";
import { emptyTrade } from "../models/trade";
import { tradeDraftToForm } from "./tradeDraftForm";

describe("tradeDraftToForm", () => {
  it("prefills only stated draft fields and matches strategy version names", () => {
    const form = tradeDraftToForm({
      date: null,
      asset: "Gold",
      direction: "Short",
      entry: 2345,
      exit: 2330,
      stopLoss: null,
      takeProfit: null,
      pnl: -15,
      session: null,
      strategyName: "Gold Setup",
      versionNumber: 2,
      conditions: ["Liquidity Sweep", "MSS"],
      indicators: ["RSI"],
    }, [{
      name: "Gold Setup",
      versions: [{ id: "version-id", version: 2 }],
    }], emptyTrade);

    expect(form).toMatchObject({
      date: "",
      asset: "Gold",
      direction: "Short",
      entry: 2345,
      exit: 2330,
      stopLoss: "",
      takeProfit: "",
      pnl: -15,
      session: "",
      strategy: "Gold Setup",
      strategyVersionId: "version-id",
      liquiditySweep: true,
      mss: true,
      fvg: false,
      indicators: ["RSI"],
    });
    expect(form).not.toBe(emptyTrade);
    expect(form.metrics).not.toBe(emptyTrade.metrics);
  });
});
