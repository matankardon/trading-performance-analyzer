import { describe, expect, it } from "vitest";
import { buildCoachContext } from "../../../src/services/coachContext.js";
import { isValidCoachChatRequest } from "./requestValidation";

const versionId = "11111111-1111-4111-8111-111111111111";
const secondTradeId = "22222222-2222-4222-8222-222222222222";
const validDraftAllowLists = {
  sessions: ["New York", "London", "Asia", "Overlap"],
  conditions: ["Liquidity Sweep", "MSS", "FVG", "Displacement", "Order Block", "Stochastic Confirmation"],
  indicators: ["SMA", "EMA", "RSI", "MACD", "Bollinger", "ADX", "Fibonacci", "Ichimoku", "StdDev"],
  strategies: [{ name: "Opening Range", versions: [1] }],
};
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
  strategyVersionId: versionId,
})), [{
  name: "Opening Range",
  versions: [{
    id: versionId,
    version: 1,
    conditions: { liquiditySweep: true, smaConfirmation: true },
    latestBacktestSummary: {
      asset: "AAPL",
      timeframe: "5m",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
      createdAt: "2026-10-02",
      metrics: { tradeCount: 8, winRate: 50, netPnl: 20, profitFactor: 1.5, expectancy: 2.5, maxDrawdown: 10, averageRiskReward: 2 },
    },
  }],
}], "2026-10-07");

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
    expect(isValidCoachChatRequest(request({ mode: "stream" }))).toBe(true);
    expect(isValidCoachChatRequest(request({ mode: "complete" }))).toBe(true);
    expect(isValidCoachChatRequest(request({ mode: "title" }))).toBe(true);
    expect(isValidCoachChatRequest(request({
      mode: "analyze_screenshot",
      tradeIds: [versionId],
    }))).toBe(true);
    expect(isValidCoachChatRequest({
      mode: "draft_trade",
      message: "Log a trade: short gold",
      history: [],
      allowLists: validDraftAllowLists,
    })).toBe(true);
    expect(isValidCoachChatRequest(request({ mode: "admin" }))).toBe(false);
  });

  it("validates screenshot IDs and trade ID limits", () => {
    expect(isValidCoachChatRequest(request({ mode: "analyze_screenshot", tradeIds: ["not-a-uuid"] }))).toBe(false);
    expect(isValidCoachChatRequest(request({
      mode: "analyze_screenshot",
      tradeIds: [versionId, secondTradeId, "33333333-3333-4333-8333-333333333333"],
    }))).toBe(false);
    expect(isValidCoachChatRequest(request({ mode: "analyze_screenshot", tradeIds: [] }))).toBe(false);
    expect(isValidCoachChatRequest(request({ mode: "analyze_screenshot", tradeIds: [versionId], stream: "yes" }))).toBe(false);
  });

  it("validates draft allow-lists without accepting extra fields", () => {
    expect(isValidCoachChatRequest({
      mode: "draft_trade",
      message: "Log a trade",
      history: [],
      allowLists: { ...validDraftAllowLists, unexpected: [] },
    })).toBe(false);
    expect(isValidCoachChatRequest({
      mode: "draft_trade",
      message: "Log a trade",
      history: [],
      allowLists: { ...validDraftAllowLists, indicators: ["not an indicator"] },
    })).toBe(false);
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