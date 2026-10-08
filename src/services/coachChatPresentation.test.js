import { describe, expect, it } from "vitest";
import { cleanCoachTitle, isFullReportReply, suggestedFollowUps } from "./coachChatPresentation";

describe("coach chat presentation helpers", () => {
  it("recognizes full reports and suggests report-specific follow-ups", () => {
    const report = "## Summary\nOne\n## Performance\nTwo\n## Strengths\nThree\n## Weaknesses\nFour";
    expect(isFullReportReply(report)).toBe(true);
    expect(suggestedFollowUps(report)).toEqual(["Compare to last month", "What should I fix first?"]);
  });

  it("suggests a Strategy Lab follow-up for strategy replies", () => {
    expect(suggestedFollowUps("Compare the backtest with forward results."))
      .toEqual(["Turn this into a testable rule"]);
  });

  it("limits AI-generated titles to six words and falls back cleanly", () => {
    expect(cleanCoachTitle('  "Reviewing my weekly trading performance in detail"  '))
      .toBe("Reviewing my weekly trading performance in");
    expect(cleanCoachTitle("")).toBe("");
  });
});
