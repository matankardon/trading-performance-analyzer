import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChartWorkspace from "./ChartWorkspace";

describe("ChartWorkspace", () => {
  it("keeps the embedded TradingView chart and strategy/version selector", () => {
    const strategy = {
      id: "momentum",
      name: "Momentum",
      versions: [{ id: "momentum-v2", version: 2, conditions: { smaConfirmation: true } }],
    };
    render(<ChartWorkspace selectedAsset="AAPL" strategyLibrary={[strategy]} />);
    expect(screen.getByRole("heading", { name: "TradingView chart · AAPL" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Strategy" })).toHaveValue("momentum");
    expect(screen.getByRole("combobox", { name: "Strategy version" })).toHaveValue("momentum-v2");
    expect(screen.getByText(/TradingView\. Indicators and setup conditions/)).toBeInTheDocument();
  });

  it("routes manual-only strategy instructions to Strategy Lab", () => {
    const strategy = {
      id: "manual",
      name: "Manual",
      versions: [{ id: "manual-v1", version: 1, conditions: { liquiditySweep: true } }],
    };
    const onPageChange = vi.fn();
    render(<ChartWorkspace selectedAsset="AAPL" strategyLibrary={[strategy]} onPageChange={onPageChange} />);
    expect(screen.getByText(/only manual conditions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Strategy Lab" }));
    expect(onPageChange).toHaveBeenCalledWith("Strategy Lab");
  });

  it("does not render the removed My trades controls or journal-trade dropdown", () => {
    render(<ChartWorkspace selectedAsset="AAPL" />);
    expect(screen.queryByRole("button", { name: "My trades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Chart view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trades on this chart/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No price bars for this symbol/)).not.toBeInTheDocument();
  });

  it("persists a version's script ID, displays its unverified chip, and adds the custom embed study", async () => {
    const strategy = {
      id: "momentum",
      name: "Momentum",
      versions: [{ id: "momentum-v2", version: 2, conditions: { smaConfirmation: true } }],
    };
    render(<ChartWorkspace selectedAsset="AAPL" strategyLibrary={[strategy]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "TradingView script ID (optional)" }), {
      target: { value: "public_123" },
    });
    expect(await screen.findByText("Custom script (unverified)")).toBeInTheDocument();
    await waitFor(() => {
      const script = document.querySelector('script[src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"]');
      expect(JSON.parse(script.textContent).studies).toContain("PUB;public_123");
    });
    expect(JSON.parse(localStorage.getItem("tradeCatalystTradingViewScriptIds"))).toEqual({ "momentum-v2": "public_123" });
  });
});
