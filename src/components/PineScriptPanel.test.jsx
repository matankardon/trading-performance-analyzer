import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PineScriptPanel from "./PineScriptPanel";

const version = {
  id: "ma-v2",
  strategyName: "Moving Average",
  version: 2,
  conditions: { smaConfirmation: true, liquiditySweep: true },
};

describe("PineScriptPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("generates code and reports conditions that require manual review", () => {
    render(<PineScriptPanel version={version} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Pine Script" }));
    expect(screen.getByRole("heading", { name: "Overlay" })).toBeInTheDocument();
    expect(screen.getByText(/Not generated: Liquidity Sweep; check these manually/)).toBeInTheDocument();
    expect(screen.getByText(/Open TradingView → Pine Editor → paste → Add to chart/)).toBeInTheDocument();
    expect(screen.getByText(/It can.t be tested inside this app/)).toBeInTheDocument();
  });

  it("copies generated code and reports clipboard success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PineScriptPanel version={{ ...version, conditions: { smaConfirmation: true } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Pine Script" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("//@version=6")));
    expect(await screen.findByText("Pine Script copied.")).toBeInTheDocument();
  });

  it("shows a clear no-script result for manual-only versions", () => {
    render(<PineScriptPanel version={{
      ...version,
      conditions: { liquiditySweep: true, mss: true },
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Pine Script" }));
    expect(screen.getByText(/No supported indicators or setup conditions are enabled/)).toBeInTheDocument();
    expect(screen.getByText(/Not generated: Liquidity Sweep, MSS/)).toBeInTheDocument();
  });

  it("persists an optional TradingView script ID", () => {
    render(<PineScriptPanel version={version} />);
    fireEvent.change(screen.getByRole("textbox", { name: "TradingView script ID (optional)" }), {
      target: { value: "pub_42" },
    });
    expect(JSON.parse(localStorage.getItem("tradeCatalystTradingViewScriptIds"))).toEqual({ "ma-v2": "pub_42" });
  });
});
