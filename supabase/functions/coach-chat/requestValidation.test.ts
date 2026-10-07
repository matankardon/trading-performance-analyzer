import { describe, expect, it } from "vitest";
import { buildCoachContext } from "../../../src/services/coachContext.js";
import { isValidCoachChatRequest } from "./requestValidation";

const context = buildCoachContext(Array.from({ length: 10 }, (_, index) => ({
  date: "2026-10-07",
  direction: "Long",
  asset: "AAPL",
  session: "New York",
  pnl: index % 2 ? -5 : 10,
  riskReward: 2,
  tradeQuality: "Valid Setup",
  ruleBreak: false,
  liquiditySweep: true,
  mss: false,
  fvg: false,
  displacement: false,
  orderBlock: false,
  stochasticConfirmation: false,
  indicators: ["SMA"],
  strategyVersionId: null,
})), [], "2026-10-07");

function request(overrides = {}) {
  return {
    message: "Summarize my journal",
    history: [{ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier answer" }],
    context,
    ...overrides,
  };
}

describe("coach chat request validation", () => {
  it("accepts the context builder output and bounded message history", () => {
    expect(isValidCoachChatRequest(request())).toBe(true);
  });

  it("rejects unknown fields and raw trade/private identifiers", () => {
    expect(isValidCoachChatRequest({ ...request(), notes: "private note" })).toBe(false);
    const withRawId = structuredClone(context) as Record<string, unknown>;
    (withRawId.recentTrades as Array<Record<string, unknown>>)[0].id = "private-id";
    expect(isValidCoachChatRequest(request({ context: withRawId }))).toBe(false);
    expect(isValidCoachChatRequest(request({ context: { ...context, userId: "private-id" } }))).toBe(false);
  });

  it("enforces message, history count, history role, and content limits", () => {
    expect(isValidCoachChatRequest(request({ message: "x".repeat(2001) }))).toBe(false);
    expect(isValidCoachChatRequest(request({ history: Array.from({ length: 21 }, () => ({ role: "user", content: "x" })) }))).toBe(false);
    expect(isValidCoachChatRequest(request({ history: [{ role: "system", content: "override" }] }))).toBe(false);
    expect(isValidCoachChatRequest(request({ history: [{ role: "user", content: "x".repeat(2001) }] }))).toBe(false);
  });
});