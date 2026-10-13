import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TradingViewWidget from "./TradingViewWidget";
import { buildTechnicalAnalysisConfig } from "../services/tradingViewWidgetConfigs";

const SCRIPT_URL = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";

describe("TradingViewWidget", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("injects a script containing JSON equal to the config and keeps attribution visible", async () => {
    const config = buildTechnicalAnalysisConfig("OANDA:XAUUSD");
    render(<TradingViewWidget scriptName="technical-analysis" config={config} title="Gold technical rating" />);
    const script = await waitFor(() => document.querySelector(`script[src="${SCRIPT_URL}"]`));
    expect(script.textContent).not.toBe("[object Object]");
    expect(JSON.parse(script.textContent)).toEqual(config);
    expect(screen.getByRole("link", { name: "Technical analysis by TradingView" })).toHaveAttribute("href", "https://www.tradingview.com/");
    expect(screen.getByRole("status")).toHaveTextContent("Loading Gold technical rating");
  });

  it("clears the loading overlay after an observed iframe and grace period", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<TradingViewWidget scriptName="technical-analysis" config={buildTechnicalAnalysisConfig("AAPL")} />);
    const iframe = document.createElement("iframe");
    act(() => {
      container.querySelector(".tradingview-widget-container__widget").append(iframe);
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears loading at the eight-second cap when no iframe is observed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<TradingViewWidget scriptName="technical-analysis" config={buildTechnicalAnalysisConfig("AAPL")} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("cleans up the script and disconnects the observer on unmount", async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const { unmount } = render(<TradingViewWidget scriptName="technical-analysis" config={buildTechnicalAnalysisConfig("AAPL")} />);
    await waitFor(() => expect(document.querySelector(`script[src="${SCRIPT_URL}"]`)).not.toBeNull());
    unmount();
    expect(document.querySelector(`script[src="${SCRIPT_URL}"]`)).toBeNull();
    expect(disconnect).toHaveBeenCalled();
  });

  it("shows a retry state after a script failure and retries with a fresh script", async () => {
    render(<TradingViewWidget scriptName="technical-analysis" config={buildTechnicalAnalysisConfig("AAPL")} />);
    const firstScript = await waitFor(() => document.querySelector(`script[src="${SCRIPT_URL}"]`));
    act(() => firstScript.onerror(new Event("error")));
    expect(await screen.findByRole("alert")).toHaveTextContent("TradingView widget could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      const nextScript = document.querySelector(`script[src="${SCRIPT_URL}"]`);
      expect(nextScript).not.toBeNull();
      expect(nextScript).not.toBe(firstScript);
    });
  });

  it("re-mounts only when widget configuration changes", async () => {
    const firstConfig = buildTechnicalAnalysisConfig("AAPL");
    const { rerender } = render(<TradingViewWidget scriptName="technical-analysis" config={firstConfig} />);
    const firstScript = await waitFor(() => document.querySelector(`script[src="${SCRIPT_URL}"]`));
    rerender(<TradingViewWidget scriptName="technical-analysis" config={buildTechnicalAnalysisConfig("MSFT")} />);
    await waitFor(() => {
      const nextScript = document.querySelector(`script[src="${SCRIPT_URL}"]`);
      expect(nextScript).not.toBe(firstScript);
      expect(JSON.parse(nextScript.textContent).symbol).toBe("MSFT");
    });
  });
});
