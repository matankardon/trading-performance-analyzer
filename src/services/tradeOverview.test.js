import { describe, expect, it, vi } from "vitest";
import { openCreatedTradeOverview } from "./tradeOverview";

describe("openCreatedTradeOverview", () => {
  it("opens a newly saved trade on the Trades page", () => {
    const trade = { id: "saved-trade" };
    const setActivePage = vi.fn();
    const setSelectedTrade = vi.fn();

    expect(openCreatedTradeOverview(trade, { setActivePage, setSelectedTrade })).toBe(true);
    expect(setActivePage).toHaveBeenCalledWith("Trades");
    expect(setSelectedTrade).toHaveBeenCalledWith(trade);
  });

  it("leaves the existing view unchanged when editing", () => {
    const setActivePage = vi.fn();
    const setSelectedTrade = vi.fn();

    expect(openCreatedTradeOverview(null, { setActivePage, setSelectedTrade })).toBe(false);
    expect(setActivePage).not.toHaveBeenCalled();
    expect(setSelectedTrade).not.toHaveBeenCalled();
  });
});
