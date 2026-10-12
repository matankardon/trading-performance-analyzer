import { describe, expect, it } from "vitest";
import { studiesForVersion } from "./tradingViewStudies";

describe("studiesForVersion", () => {
  it("maps supported indicators and passes declared input parameters", () => {
    expect(studiesForVersion({ conditions: {
      smaConfirmation: true,
      rsiConfirmation: true,
      indicatorSettings: {
        smaConfirmation: { period: 50 },
        rsiConfirmation: { period: 9 },
      },
    } })).toEqual([
      { key: "smaConfirmation", label: "SMA", id: "MASimple@tv-basicstudies", inputs: { length: 50 }, applied: true, reason: "" },
      { key: "rsiConfirmation", label: "RSI", id: "RSI@tv-basicstudies", inputs: { length: 9 }, applied: true, reason: "" },
    ]);
  });

  it("maps the remaining built-in study identifiers", () => {
    const studies = studiesForVersion({ conditions: {
      emaConfirmation: true,
      macdConfirmation: true,
      bollingerConfirmation: true,
      adxConfirmation: true,
      ichimokuConfirmation: true,
      stdDevConfirmation: true,
    } });
    expect(studies.map(({ id }) => id)).toEqual([
      "MAExp@tv-basicstudies",
      "MACD@tv-basicstudies",
      "BB@tv-basicstudies",
      "ADX@tv-basicstudies",
      "IchimokuCloud@tv-basicstudies",
      "StdDev@tv-basicstudies",
    ]);
  });

  it("marks unsupported indicators and manual conditions for manual checking", () => {
    expect(studiesForVersion({ conditions: { fibonacciConfirmation: true, liquiditySweep: true } }))
      .toEqual([
        { key: "fibonacciConfirmation", label: "Fibonacci", id: null, inputs: {}, applied: false, reason: "check manually" },
        { key: "liquiditySweep", label: "Liquidity Sweep", id: null, inputs: {}, applied: false, reason: "check manually" },
      ]);
  });

  it("returns no studies for an empty version", () => {
    expect(studiesForVersion(null)).toEqual([]);
    expect(studiesForVersion({ conditions: {} })).toEqual([]);
  });
});
