import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EconomicCalendar from "./EconomicCalendar";

vi.mock("./NewsFeed", () => ({
  default: ({ scope }) => <section aria-label={`${scope} news feed`} />,
}));

describe("EconomicCalendar", () => {
  it("renders the economic calendar, market news panel, and evergreen event guide", async () => {
    render(<EconomicCalendar />);
    const events = await waitFor(() => document.querySelector(
      'script[src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"]',
    ));
    expect(JSON.parse(events.textContent)).toMatchObject({
      colorTheme: "dark",
      isTransparent: false,
      locale: "en",
    });
    expect(screen.getByRole("heading", { name: "Events & News" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Event guide" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "markets news feed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Economic calendar by TradingView" })).toBeVisible();
    expect(screen.getByText("Consumer Price Index (CPI)")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Market news by TradingView" })).not.toBeInTheDocument();
    expect(screen.queryByText("EVENT DATA · CONNECTED")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Importance")).not.toBeInTheDocument();
  });
});
