import { describe, expect, it } from "vitest";
import {
  indicatorChipText,
  studiesForVersion,
  dedupeVerifiedStudyIds,
  TRADINGVIEW_STUDY_IDS,
} from "./tradingViewStudies";

describe("TradingView study mapping", () => {
  it("uses the verified standard IDs for common chart indicators", () => {
    expect(TRADINGVIEW_STUDY_IDS).toMatchObject({
      smaConfirmation: { id: "STD;SMA", verified: true },
      emaConfirmation: { id: "STD;EMA", verified: true },
      rsiConfirmation: { id: "STD;RSI", verified: true },
      macdConfirmation: { id: "STD;MACD", verified: true },
      bollingerConfirmation: { id: "STD;Bollinger_Bands", verified: true },
      adxConfirmation: { id: "STD;ADX", verified: true },
    });
    const result = studiesForVersion({ conditions: {
      smaConfirmation: true,
      emaConfirmation: true,
      rsiConfirmation: true,
      macdConfirmation: true,
      bollingerConfirmation: true,
      adxConfirmation: true,
    } });
    expect(result.studies).toEqual([
      "STD;SMA",
      "STD;EMA",
      "STD;RSI",
      "STD;MACD",
      "STD;Bollinger_Bands",
      "STD;ADX",
    ]);
    expect(result.indicators.every(({ status }) => status === "sent")).toBe(true);
  });

  it("emits the exact standard study IDs for Bollinger Bands and RSI", () => {
    const result = studiesForVersion({ conditions: {
      bollingerConfirmation: true,
      rsiConfirmation: true,
    } });
    expect(JSON.stringify(result.studies)).toBe('["STD;RSI","STD;Bollinger_Bands"]');
  });

  it("does not send unverified candidate IDs", () => {
    expect(TRADINGVIEW_STUDY_IDS.ichimokuConfirmation).toEqual({
      id: "STD;Ichimoku%Cloud",
      verified: false,
    });
    expect(TRADINGVIEW_STUDY_IDS.stdDevConfirmation).toEqual({
      id: "STD;Standard_Deviation",
      verified: false,
    });
    const result = studiesForVersion({ conditions: {
      ichimokuConfirmation: true,
      stdDevConfirmation: true,
    } });
    expect(result.studies).toEqual([]);
    expect(result.indicators.map(({ status }) => status)).toEqual(["unverified", "unverified"]);
  });

  it("deduplicates study IDs before returning the widget list", () => {
    expect(dedupeVerifiedStudyIds([
      { id: "STD;RSI", status: "sent" },
      { id: "STD;RSI", status: "sent" },
      { id: "STD;SMA", status: "sent" },
      { id: "STD;Ichimoku%Cloud", status: "unverified" },
    ])).toEqual(["STD;RSI", "STD;SMA"]);
  });

  it("shows declared parameters as chart-settings guidance rather than sending overrides", () => {
    const { indicators } = studiesForVersion({ conditions: {
      smaConfirmation: true,
      bollingerConfirmation: true,
      indicatorSettings: {
        smaConfirmation: { period: 20 },
        bollingerConfirmation: { period: 20, stdDevMultiplier: 2 },
      },
    } });
    expect(indicatorChipText(indicators[0])).toBe(
      "SMA 20: Sent to chart · sent with default length; set length 20 in chart settings",
    );
    expect(indicatorChipText(indicators[1])).toContain("set length 20, standard deviation 2 in chart settings");
  });

  it("marks unsupported indicators and setup conditions for manual checking", () => {
    const result = studiesForVersion({ conditions: {
      fibonacciConfirmation: true,
      liquiditySweep: true,
    } });
    expect(result.indicators.map(({ status }) => status)).toEqual(["manual"]);
    expect(result.manualConditions).toEqual([
      { key: "liquiditySweep", label: "Liquidity Sweep", status: "manual" },
    ]);
    expect(indicatorChipText(result.indicators[0])).toBe("Fibonacci: Check manually");
  });

  it("identifies versions that declare manual conditions but no chart indicators", () => {
    expect(studiesForVersion({ conditions: { liquiditySweep: true, mss: true } })).toMatchObject({
      studies: [],
      manualOnly: true,
    });
    expect(studiesForVersion(null)).toMatchObject({ studies: [], manualOnly: false });
    expect(studiesForVersion({ conditions: {} })).toMatchObject({ studies: [], manualOnly: false });
  });
});
