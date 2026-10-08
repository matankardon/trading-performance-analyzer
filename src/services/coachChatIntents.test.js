import { describe, expect, it } from "vitest";
import {
  formatTradeDraftReply,
  matchScreenshotIntent,
  matchTradeDraftIntent,
  mostRecentScreenshotTrade,
  screenshotHistoryText,
} from "./coachChatIntents";

describe("coach chat intent matching", () => {
  it.each([
    "Look at my last trade's screenshot",
    "Can you analyze the latest trade’s saved screenshot?",
    "Please inspect this screenshot",
  ])("recognizes screenshot request: %s", (message) => {
    expect(matchScreenshotIntent(message)).toBe(true);
  });

  it.each([
    "What happened in the market today?",
    "I took a look at the chart",
    "How did my last trade perform?",
  ])("does not classify general chat as screenshot request: %s", (message) => {
    expect(matchScreenshotIntent(message)).toBe(false);
  });

  it.each(["Log a trade: short gold", "Please add a trade", "I took a short on gold"])(
    "recognizes explicit trade logging: %s",
    (message) => expect(matchTradeDraftIntent(message)).toBe(true),
  );

  it.each(["What is a trade journal?", "I took a look at gold", "Can you add this to the report?"])(
    "does not classify ordinary chat as a trade draft: %s",
    (message) => expect(matchTradeDraftIntent(message)).toBe(false),
  );
});

describe("screenshot and trade draft presentation helpers", () => {
  it("selects the most recent trade with a screenshot", () => {
    const recent = { id: "new", screenshotPath: "opaque", createdAt: "2026-10-08T10:00:00Z" };
    expect(mostRecentScreenshotTrade([
      { id: "newer", date: "2026-10-09", screenshotPath: null },
      { id: "older", screenshotPath: "opaque", createdAt: "2026-10-07T10:00:00Z" },
      recent,
    ])).toBe(recent);
    expect(mostRecentScreenshotTrade([])).toBeNull();
  });

  it("creates text-only history summaries without identifiers or URLs", () => {
    const text = screenshotHistoryText([{ asset: "Gold", date: "2026-10-07", id: "private-id", screenshotPath: "secret/path" }]);
    expect(text).toBe("Looked at screenshot of Gold 2026-10-07");
    expect(text).not.toMatch(/private-id|secret|https?:\/\//);
    expect(screenshotHistoryText([{ asset: "private/storage/path", date: "2026-10-07" }]))
      .not.toContain("private/storage/path");
  });

  it("names draft fields that were not stated", () => {
    expect(formatTradeDraftReply({ asset: "Gold", direction: null, entry: null, exit: 10, stopLoss: null, takeProfit: null, pnl: null, date: null, session: null, strategyName: null, versionNumber: null }))
      .toContain("Not stated in your message: direction, entry, stop loss");
  });
});
