import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StrategyWorkspace from "./StrategyWorkspace";
import { fetchHistoricalBars } from "../services/historicalDataService";

const { orderBacktests } = vi.hoisted(() => ({ orderBacktests: vi.fn() }));

vi.mock("../services/historicalDataService", () => ({
  fetchHistoricalBars: vi.fn(),
  historicalAssetSuggestions: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "SPY", "QQQ"],
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          order: orderBacktests,
        })),
      })),
    })),
  },
}));

const version = {
  id: "version-1",
  version: 2,
  conditions: { liquiditySweep: true, mss: true, smaConfirmation: true },
  requiredConditions: ["mss"],
};
const strategyLibrary = [{ id: "strategy-1", name: "Momentum", session: "London", versions: [version] }];

function makeTrades() {
  return [
    { strategyVersionId: "version-1", pnl: 100, riskReward: 2, ruleBreak: false, liquiditySweep: true, mss: true, indicators: ["SMA"] },
    { strategyVersionId: "version-1", pnl: 50, riskReward: 1.5, ruleBreak: false, liquiditySweep: true, mss: true, indicators: ["SMA"] },
    { strategyVersionId: "version-1", pnl: -25, riskReward: 1, ruleBreak: true, liquiditySweep: false, mss: true, indicators: [] },
    { strategyVersionId: "version-1", pnl: 20, riskReward: 1.2, ruleBreak: false, liquiditySweep: true, mss: true, indicators: ["SMA"] },
    { strategyVersionId: "version-1", pnl: -5, riskReward: 1, ruleBreak: false, liquiditySweep: true, mss: true, indicators: ["SMA"] },
  ];
}

describe("StrategyWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    fetchHistoricalBars.mockResolvedValue([{ timestamp: Date.UTC(2026, 9, 8), open: 100, high: 110, low: 95, close: 105, volume: 10 }]);
    orderBacktests.mockResolvedValue({ data: [], error: null });
  });

  it("updates score from journal-observation ticks and required missing conditions force Not ready", () => {
    render(<StrategyWorkspace strategyLibrary={strategyLibrary} selectedAsset="AAPL" />);
    expect(screen.getByLabelText("Setup score 0 out of 100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Liquidity Sweep/ }));
    expect(screen.getByLabelText("Setup score 33 out of 100")).toBeInTheDocument();
    expect(screen.getByText("Not ready")).toBeInTheDocument();
    expect(screen.getByText(/Required condition missing: MSS/)).toBeInTheDocument();
    expect(screen.getByText("Decision support only — not a prediction.")).toBeInTheDocument();
  });

  it("shows forward evidence with sample labels and data-driven exact-condition statistics", async () => {
    render(<StrategyWorkspace strategyLibrary={strategyLibrary} selectedAsset="AAPL" trades={makeTrades()} />);
    await waitFor(() => expect(screen.getAllByText("n=5").length).toBeGreaterThan(0));
    expect(screen.getByText("Journal win rate")).toBeInTheDocument();
    expect(screen.getByText("When these exact conditions were present")).toBeInTheDocument();
    expect(screen.getByText(/win rate 60\.0% · expectancy \$28\.00/)).toBeInTheDocument();
    expect(screen.getByText("Rule-break cost")).toBeInTheDocument();
    expect(screen.getByText(/30 or more trades/)).toBeInTheDocument();
  });

  it("shows the latest saved backtest sample and forward deltas", async () => {
    orderBacktests.mockResolvedValue({
      data: [{
        id: "run-1",
        strategy_version_id: "version-1",
        metrics: { tradeCount: 10, winRate: 40, profitFactor: 1.5, expectancy: 10 },
        trades: [],
      }],
      error: null,
    });
    render(<StrategyWorkspace strategyLibrary={strategyLibrary} selectedAsset="AAPL" trades={makeTrades()} />);
    expect(await screen.findByText("Latest backtest sample: n=10")).toBeInTheDocument();
    expect(screen.getByText("+20.0%")).toBeInTheDocument();
    expect(screen.getByText("+$18.00")).toBeInTheDocument();
  });

  it("passes the selected setup as Add Trade form prefill and clears persisted checklist", async () => {
    const onLogTrade = vi.fn();
    render(<StrategyWorkspace strategyLibrary={strategyLibrary} selectedAsset="AAPL" onLogTrade={onLogTrade} />);
    fireEvent.click(screen.getByRole("button", { name: /Liquidity Sweep/ }));
    fireEvent.click(screen.getByRole("button", { name: /SMA/ }));
    await waitFor(() => expect(localStorage.getItem("tradeCatalystSetupChecklist")).toContain("liquiditySweep"));
    fireEvent.click(screen.getByRole("button", { name: "Log this trade" }));
    expect(onLogTrade).toHaveBeenCalledWith(expect.objectContaining({
      asset: "AAPL",
      strategy: "Momentum",
      strategyVersionId: "version-1",
      liquiditySweep: true,
      indicators: ["SMA"],
    }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("tradeCatalystSetupChecklist"))).not.toHaveProperty("version-1"));
  });

  it("restores a version's checklist from localStorage and exposes empty states", () => {
    localStorage.setItem("tradeCatalystSetupChecklist", JSON.stringify({
      "version-1": { checked: { mss: true }, session: "New York", entryTimingReviewed: false },
    }));
    const { unmount } = render(<StrategyWorkspace strategyLibrary={strategyLibrary} />);
    expect(screen.getByRole("button", { name: /MSS/ })).toHaveAttribute("aria-pressed", "true");
    unmount();
    render(<StrategyWorkspace strategyLibrary={strategyLibrary} />);
    expect(screen.getByText(/No journaled trades are linked to this version/)).toBeInTheDocument();
    render(<StrategyWorkspace strategyLibrary={[]} />);
    expect(screen.getByText("No saved strategies yet")).toBeInTheDocument();
  });
});
