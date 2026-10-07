import { describe, expect, it } from "vitest";
import { processCoachSummary } from "./postProcessing";

const analysis = {
  totalTrades: 10,
  factors: [{
    label: "Session",
    groups: [
      { key: "New York", n: 5, expectancy: 12.345, winRate: 60 },
      { key: "London", n: 5, expectancy: -2, winRate: 40 },
    ],
  }],
};

describe("coach summary post-processing", () => {
  it("parses fenced JSON and returns the expected summary shape", () => {
    const result = processCoachSummary(`
      \`\`\`json
      {"summary":"Session expectancy was $12.345 (n=5).","strengths":["Session expectancy is strongest at $12.345 (n=5)."],"weaknesses":[],"focusNext":["Review the London session expectancy of -$2 (n=5)."]}
      \`\`\`
    `, analysis);

    expect(result).toEqual({
      ok: true,
      result: {
        summary: "Session expectancy was $12.345 (n=5).",
        strengths: ["Session expectancy is strongest at $12.345 (n=5)."],
        weaknesses: [],
        focusNext: ["Review the London session expectancy of -$2 (n=5)."],
      },
    });
  });

  it("returns an error for malformed JSON or an incorrect schema", () => {
    expect(processCoachSummary("{not json", analysis)).toEqual({ ok: false, error: "INVALID_JSON" });
    expect(processCoachSummary(JSON.stringify({ summary: "Session expectancy is $12.345 (n=5)." }), analysis))
      .toEqual({ ok: false, error: "INVALID_SCHEMA" });
  });

  it("drops list items containing numbers absent from the aggregate input", () => {
    const result = processCoachSummary(JSON.stringify({
      summary: "Session expectancy is $12.345 (n=5).",
      strengths: ["Session expectancy is $12.345 (n=5).", "Win rate improved by 99% (n=5)."],
      weaknesses: [],
      focusNext: [],
    }), analysis);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.strengths).toEqual(["Session expectancy is $12.345 (n=5)."]);
  });

  it("accepts rounded output within the configured numeric tolerance", () => {
    const result = processCoachSummary(JSON.stringify({
      summary: "Session expectancy was $12.35 (n=5).",
      strengths: [],
      weaknesses: [],
      focusNext: [],
    }), analysis);
    expect(result.ok).toBe(true);
  });

  it("returns an error rather than empty success when every summary number is ungrounded", () => {
    const result = processCoachSummary(JSON.stringify({
      summary: "Session expectancy was $999 (n=123).",
      strengths: ["Session expectancy was $999 (n=123)."],
      weaknesses: ["Win rate fell by 87% (n=123)."],
      focusNext: ["Review the 87% decline in expectancy (n=123)."],
    }), analysis);
    expect(result).toEqual({ ok: false, error: "NO_GROUNDED_CONTENT" });
  });
});