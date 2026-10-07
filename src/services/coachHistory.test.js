import { describe, expect, it } from "vitest";
import { conversationGroup, deriveConversationTitle, groupConversations, relativeConversationTime } from "./coachHistory";

describe("coach conversation history", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");

  it("derives a cleaned title from the first message and caps it at 50 characters", () => {
    expect(deriveConversationTitle("  Let's work\n on my strategy  ")).toBe("Let's work on my strategy");
    expect(deriveConversationTitle("x".repeat(80))).toBe("x".repeat(50));
    expect(deriveConversationTitle("\u0000\u0001")).toBe("New chat");
  });

  it("groups conversations into Today, Yesterday, Previous 7 days, and Older", () => {
    expect(conversationGroup("2026-10-07T09:00:00Z", now)).toBe("Today");
    expect(conversationGroup("2026-10-06T09:00:00Z", now)).toBe("Yesterday");
    expect(conversationGroup("2026-10-02T09:00:00Z", now)).toBe("Previous 7 days");
    expect(conversationGroup("2026-09-20T09:00:00Z", now)).toBe("Older");

    const grouped = groupConversations([
      { id: "old", updated_at: "2026-09-20T09:00:00Z" },
      { id: "today", updated_at: "2026-10-07T09:00:00Z" },
      { id: "yesterday", updated_at: "2026-10-06T09:00:00Z" },
      { id: "week", updated_at: "2026-10-02T09:00:00Z" },
    ], now);
    expect(grouped.map(({ label }) => label)).toEqual(["Today", "Yesterday", "Previous 7 days", "Older"]);
    expect(grouped.map(({ conversations }) => conversations[0].id)).toEqual(["today", "yesterday", "week", "old"]);
  });

  it("formats relative times without losing group labels", () => {
    expect(relativeConversationTime("2026-10-07T11:59:00Z", now)).toBe("1m ago");
    expect(relativeConversationTime("2026-10-06T09:00:00Z", now)).toBe("Yesterday");
    expect(relativeConversationTime("invalid", now)).toBe("Unknown time");
  });
});
