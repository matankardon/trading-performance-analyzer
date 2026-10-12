import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TradingViewChart from "./TradingViewChart";
import { assertWidgetConfigShape, buildWidgetConfig } from "../services/tradingViewWidgetConfig";

const GOLD_BOLLINGER_STUDIES = [{
  id: "BB@tv-basicstudies",
  inputs: { length: 20, stdDev: 2 },
  applied: true,
}];

function expectSafeWidgetConfig(config) {
  expect(assertWidgetConfigShape(config)).toBe(true);
  for (const [key, value] of Object.entries(config)) {
    if (key === "studies_overrides") {
      for (const [overrideKey, overrideValue] of Object.entries(value)) {
        expect(typeof overrideKey).toBe("string");
        expect(String(overrideValue)).not.toBe("[object Object]");
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => expect(String(item)).not.toBe("[object Object]"));
    } else {
      expect(String(value)).not.toBe("[object Object]");
    }
  }
}

describe("TradingViewChart", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds plain JSON-safe config and injects the exact serialized config string", async () => {
    const studies = [{ id: "RSI@tv-basicstudies", inputs: { length: 9 }, applied: true }];
    const config = buildWidgetConfig({ symbol: "OANDA:XAUUSD", interval: "60", studies });
    expect(() => JSON.parse(JSON.stringify(config))).not.toThrow();
    expect(config).toMatchObject({
      symbol: "OANDA:XAUUSD",
      interval: "60",
      studies: ["RSI@tv-basicstudies"],
      theme: "dark",
      locale: "en",
    });
    render(<TradingViewChart symbol="OANDA:XAUUSD" interval="60" studies={studies} />);
    const script = await waitFor(() => document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]'));
    expect(script.textContent).not.toBe("[object Object]");
    expect(JSON.parse(script.textContent)).toEqual(config);
  });

  it.each([
    ["no studies", []],
    ["Bollinger with overrides", GOLD_BOLLINGER_STUDIES],
    ["Bollinger without overrides", [{ id: "BB@tv-basicstudies", applied: true }]],
    ["several studies with overrides", [
      ...GOLD_BOLLINGER_STUDIES,
      { id: "RSI@tv-basicstudies", inputs: { length: 14 }, applied: true },
    ]],
    ["several studies without overrides", [
      { id: "BB@tv-basicstudies", applied: true },
      { id: "RSI@tv-basicstudies", applied: true },
    ]],
  ])("produces a flat JSON-safe config for %s", (_name, studies) => {
    const config = buildWidgetConfig({ symbol: "OANDA:XAUUSD", interval: "60", studies });
    expectSafeWidgetConfig(config);
    expect(config.studies.every((studyId) => typeof studyId === "string")).toBe(true);
  });

  it("rejects object values inside studies and nested study overrides", () => {
    expect(() => assertWidgetConfigShape({ studies: [{ id: "BB@tv-basicstudies" }] }))
      .toThrow(/must contain only primitives/);
    expect(() => assertWidgetConfigShape({
      studies: ["BB@tv-basicstudies"],
      studies_overrides: { "bollinger bands.length": { value: 20 } },
    })).toThrow(/primitive values/);
  });

  it("produces the expected exact JSON for gold with Bollinger Bands", () => {
    const config = buildWidgetConfig({
      symbol: "OANDA:XAUUSD",
      interval: "60",
      studies: GOLD_BOLLINGER_STUDIES,
    });
    expect(JSON.stringify(config)).toBe(
      '{"symbol":"OANDA:XAUUSD","interval":"60","theme":"dark","locale":"en","timezone":"Etc/UTC","style":"1","backgroundColor":"#0D0D0D","gridColor":"rgba(212, 175, 55, 0.08)","allow_symbol_change":true,"autosize":true,"studies":["BB@tv-basicstudies"],"studies_overrides":{"bollinger bands.length":20,"bollinger bands.stdDev":2}}',
    );
  });

  it("logs the exact serialized widget config once per mount", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    render(<TradingViewChart symbol="OANDA:XAUUSD" interval="60" studies={GOLD_BOLLINGER_STUDIES} />);
    const script = await waitFor(() => document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]'));
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith("TradingView widget config JSON:", script.textContent);
  });

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

  it("logs only config keys and shows retry state if JSON serialization throws", async () => {
    const originalStringify = JSON.stringify.bind(JSON);
    vi.spyOn(JSON, "stringify").mockImplementation((value, ...args) => {
      if (value && !Array.isArray(value) && value.symbol === "AAPL") throw new Error("serialization failed");
      return originalStringify(value, ...args);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<TradingViewChart symbol="AAPL" interval="D" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("TradingView chart could not be loaded");
    expect(consoleError).toHaveBeenCalledWith("Could not serialize TradingView widget config keys:", [
      "symbol",
      "interval",
      "theme",
      "locale",
      "timezone",
      "style",
      "backgroundColor",
      "gridColor",
      "allow_symbol_change",
      "autosize",
      "studies",
      "studies_overrides",
    ]);
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
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 2500 });
  });

  it("clears the overlay 1.5 seconds after the iframe appears, without waiting for load", async () => {
    vi.useFakeTimers();
    render(<TradingViewChart symbol="AAPL" interval="D" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading TradingView chart");
    const widget = document.querySelector(".tradingview-widget-container__widget");
    const iframe = document.createElement("iframe");
    await act(async () => {
      widget.append(iframe);
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears the overlay no later than 8 seconds if no iframe appears", async () => {
    vi.useFakeTimers();
    render(<TradingViewChart symbol="AAPL" interval="D" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading TradingView chart");
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("re-shows the overlay for a changed symbol and disconnects its observer on unmount", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const { rerender, unmount } = render(<TradingViewChart symbol="AAPL" interval="D" />);
    const firstWidget = document.querySelector(".tradingview-widget-container__widget");
    const firstFrame = document.createElement("iframe");
    firstWidget.append(firstFrame);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 2500 });

    rerender(<TradingViewChart symbol="OANDA:XAUUSD" interval="D" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading TradingView chart");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
