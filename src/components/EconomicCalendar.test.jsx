import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EconomicCalendar from "./EconomicCalendar";

describe("EconomicCalendar", () => {
  it("renders TradingView economic events and market timeline without static event data", async () => {
    render(<EconomicCalendar />);
    const events = await waitFor(() => document.querySelector(
      'script[src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"]',
    ));
    const timeline = await waitFor(() => document.querySelector(
      'script[src="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"]',
    ));
    expect(JSON.parse(events.textContent)).toMatchObject({
      colorTheme: "dark",
      isTransparent: true,
      locale: "en",
    });
    expect(JSON.parse(timeline.textContent)).toMatchObject({
      feedMode: "market",
      market: "stock",
      colorTheme: "dark",
      isTransparent: true,
      locale: "en",
    });
    expect(screen.getByRole("heading", { name: "Events & News" })).toBeInTheDocument();
    expect(screen.getByText("Events and headlines provided by TradingView.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Economic calendar by TradingView" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Market news by TradingView" })).toBeVisible();
    expect(screen.queryByText("Retail Sales")).not.toBeInTheDocument();
    expect(screen.queryByText("EVENT DATA · CONNECTED")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Importance")).not.toBeInTheDocument();
  });
});
