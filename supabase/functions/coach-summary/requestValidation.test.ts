import { describe, expect, it } from "vitest";
import { analyzeCoaching, toCoachSummaryAnalysis } from "../../../src/services/coachingAnalysis.js";
import { isValidCoachAnalysis } from "./requestValidation";

function validPayload() {
  const analysis = analyzeCoaching([
    { pnl: 10, riskReward: 2, session: "New York", liquiditySweep: true, indicators: ["SMA"], tradeQuality: "Valid Setup", ruleBreak: false, strategyVersionId: "private-version-id" },
    { pnl: -5, riskReward: null, session: "London", liquiditySweep: false, indicators: [], tradeQuality: "A+ Setup", ruleBreak: true, strategyVersionId: null },
  ]);
  return toCoachSummaryAnalysis(analysis, { from: null, to: null, strategyVersionFiltered: false });
}

describe("coach summary request validation", () => {
  it("accepts the projected aggregates-only shape", () => {
    expect(isValidCoachAnalysis(validPayload())).toBe(true);
  });

  it("rejects raw trade rows and unknown top-level or nested fields", () => {
    const payload = validPayload();
    expect(isValidCoachAnalysis({ ...payload, trades: [{ pnl: 10, notes: "private" }] })).toBe(false);
    expect(isValidCoachAnalysis({ ...payload, notes: "private" })).toBe(false);

    const withIdentifier = structuredClone(payload) as Record<string, unknown>;
    const strategyFactor = (withIdentifier.factors as Array<Record<string, unknown>>).find(({ key }) => key === "strategyVersion");
    (strategyFactor?.groups as Array<Record<string, unknown>>)[0].key = "private-version-id";
    expect(isValidCoachAnalysis(withIdentifier)).toBe(false);
  });

  it("rejects non-finite or inconsistent sample metrics", () => {
    const payload = structuredClone(validPayload()) as Record<string, unknown>;
    const sessionFactor = (payload.factors as Array<Record<string, unknown>>).find(({ key }) => key === "session");
    (sessionFactor?.groups as Array<Record<string, unknown>>)[0].expectancy = Number.NaN;
    expect(isValidCoachAnalysis(payload)).toBe(false);
  });
});