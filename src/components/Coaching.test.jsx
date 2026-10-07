import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import Coaching from "./Coaching";

const { getSession, invoke } = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getSession },
    functions: { invoke },
  },
}));

function trades(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `trade-${index + 1}`,
    date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    session: "New York",
    pnl: index % 2 ? -5 : 10,
    riskReward: 2,
    liquiditySweep: index % 2 === 0,
    mss: false,
    fvg: false,
    displacement: false,
    orderBlock: false,
    stochasticConfirmation: false,
    indicators: [],
    tradeQuality: "Valid Setup",
    ruleBreak: false,
    strategyVersionId: "private-version-id",
  }));
}

const summaryResponse = {
  ok: true,
  summary: "Session expectancy is +$2.50 across 30 journal trades.",
  strengths: ["Session expectancy is +$2.50 across 30 trades."],
  weaknesses: [],
  focusNext: ["Review expectancy by session across 30 trades."],
};

describe("Coaching AI summary", () => {
  beforeEach(() => {
    getSession.mockReset();
    invoke.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
  });

  it("disables generation below 30 trades with an explanation", () => {
    render(<Coaching trades={trades(4)} />);

    expect(screen.getByRole("button", { name: "Generate AI summary" })).toBeDisabled();
    expect(screen.getByText("AI summaries are available after 30 trades; 4 logged so far.")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends only anonymized aggregates once and renders a successful summary", async () => {
    let resolveInvocation;
    invoke.mockReturnValue(new Promise((resolve) => { resolveInvocation = resolve; }));
    render(<Coaching trades={trades(30)} />);

    const button = screen.getByRole("button", { name: "Generate AI summary" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("coach-summary", expect.objectContaining({
      headers: { Authorization: "Bearer test-token" },
      body: { analysis: expect.objectContaining({ totalTrades: 30 }) },
    }));
    const sentBody = JSON.stringify(invoke.mock.calls[0][1].body);
    expect(sentBody).not.toContain("private-version-id");
    expect(sentBody).not.toContain('"trades"');
    expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();

    resolveInvocation({ data: summaryResponse, error: null });
    expect(await screen.findByText(summaryResponse.summary)).toBeInTheDocument();
    expect(screen.getByText("AI-generated from your journal stats, not financial advice.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText(/another summary in 15s/)).toBeInTheDocument();
  });

  it("shows the Edge Function error text and offers retry", async () => {
    const response = new Response(JSON.stringify({ ok: false, error: "AI summary is not configured." }), { status: 500 });
    invoke.mockResolvedValue({ data: null, error: { status: 500, context: response } });
    render(<Coaching trades={trades(30)} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate AI summary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI summary is not configured.");
    expect(screen.getByRole("button", { name: "Retry summary" })).toBeEnabled();
  });
});