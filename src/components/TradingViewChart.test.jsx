import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TradingViewChart from "./TradingViewChart";

describe("TradingViewChart", () => {
  it("injects the official widget script and cleans it up on unmount", async () => {
    const { unmount } = render(<TradingViewChart symbol="OANDA:XAUUSD" interval="60" />);
    const script = await waitFor(() => {
      const element = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]');
      expect(element).not.toBeNull();
      return element;
    });
    expect(JSON.parse(script.textContent)).toMatchObject({
      symbol: "OANDA:XAUUSD",
      interval: "60",
      theme: "dark",
      timezone: "Etc/UTC",
      studies: [],
    });
    unmount();
    expect(document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]')).toBeNull();
  });

  it("shows a retry action when script loading fails", async () => {
    render(<TradingViewChart symbol="AAPL" interval="D" />);
    const script = await waitFor(() => {
      const element = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]');
      expect(element).not.toBeNull();
      return element;
    });
    act(() => script.onerror(new Event("error")));
    expect(await screen.findByRole("alert")).toHaveTextContent("TradingView chart could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading TradingView chart");
    await waitFor(() => expect(document.querySelectorAll('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]')).toHaveLength(1));
  });

  it("remounts when symbol and studies change and waits for the iframe load", async () => {
    const firstStudy = [{ id: "RSI@tv-basicstudies", inputs: { length: 9 }, applied: true }];
    const { rerender } = render(<TradingViewChart symbol="AAPL" interval="D" studies={firstStudy} />);
    const firstScript = await waitFor(() => document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]'));
    expect(JSON.parse(firstScript.textContent)).toMatchObject({ symbol: "AAPL", studies: ["RSI@tv-basicstudies"] });
    expect(JSON.parse(firstScript.textContent).studies_overrides).toEqual({ "relative strength index.length": 9 });

    rerender(<TradingViewChart symbol="OANDA:XAUUSD" interval="60" studies={[]} />);
    const nextScript = await waitFor(() => {
      const script = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]');
      expect(script).not.toBe(firstScript);
      return script;
    });
    expect(JSON.parse(nextScript.textContent)).toMatchObject({ symbol: "OANDA:XAUUSD", interval: "60", studies: [] });
    expect(screen.getByRole("status")).toHaveTextContent("Loading TradingView chart");
    const frame = document.createElement("iframe");
    document.querySelector(".tradingview-widget-container__widget").append(frame);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.load(frame);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
