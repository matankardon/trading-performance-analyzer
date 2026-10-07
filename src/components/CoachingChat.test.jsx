import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import CoachingChat from "./CoachingChat";

const { addLatestBacktests, loadLatestCoachConversation, requestCoachReply, saveCoachReply, deleteCoachMessage } = vi.hoisted(() => ({
  addLatestBacktests: vi.fn(),
  loadLatestCoachConversation: vi.fn(),
  requestCoachReply: vi.fn(),
  saveCoachReply: vi.fn(),
  deleteCoachMessage: vi.fn(),
}));

vi.mock("../services/coachChat", () => ({
  addLatestBacktests,
  loadLatestCoachConversation,
  requestCoachReply,
  saveCoachReply,
  deleteCoachMessage,
}));

function trades(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `trade-${index + 1}`,
    date: "2026-10-07",
    direction: "Long",
    asset: "AAPL",
    session: "New York",
    pnl: index % 2 ? -5 : 10,
    riskReward: 2,
    tradeQuality: "Valid Setup",
    ruleBreak: false,
    liquiditySweep: true,
    mss: false,
    fvg: false,
    displacement: false,
    orderBlock: false,
    stochasticConfirmation: false,
    indicators: ["SMA"],
    strategyVersionId: null,
  }));
}

async function renderReadyChat(count = 10) {
  const view = render(<CoachingChat trades={trades(count)} strategyLibrary={[]} />);
  await screen.findByRole("button", { name: "Send message" });
  return view;
}

describe("Coaching chat", () => {
  beforeEach(() => {
    addLatestBacktests.mockReset().mockResolvedValue([]);
    loadLatestCoachConversation.mockReset().mockResolvedValue({ conversationId: "conversation-id", messages: [] });
    requestCoachReply.mockReset();
    saveCoachReply.mockReset().mockResolvedValue([{ id: "saved-assistant-id", role: "assistant" }]);
    deleteCoachMessage.mockReset().mockResolvedValue(undefined);
  });

  it("shows the gate with 9 trades and enables the composer at 10", async () => {
    const { rerender } = render(<CoachingChat trades={trades(9)} strategyLibrary={[]} />);
    expect(await screen.findByText("Log 10 trades to start coaching (9/10)")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Ask your coach anything about your trading" })).not.toBeInTheDocument();

    rerender(<CoachingChat trades={trades(10)} strategyLibrary={[]} />);
    expect(await screen.findByRole("textbox", { name: "Ask your coach anything about your trading" })).toBeInTheDocument();
  });

  it("sends example prompts immediately and blocks duplicate sends while waiting", async () => {
    let resolveReply;
    requestCoachReply.mockReturnValue(new Promise((resolve) => { resolveReply = resolve; }));
    await renderReadyChat();

    const prompt = screen.getByRole("button", { name: "Which setups work best for me?" });
    fireEvent.click(prompt);
    fireEvent.click(prompt);

    await waitFor(() => expect(requestCoachReply).toHaveBeenCalledTimes(1));
    expect(requestCoachReply).toHaveBeenCalledWith("Which setups work best for me?", [], expect.objectContaining({ totalTrades: 10 }));
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    resolveReply("### Observed patterns\n\n- **Liquidity Sweep** appeared in the journal.");
    expect(await screen.findByRole("heading", { name: "Observed patterns" })).toBeInTheDocument();
    await waitFor(() => expect(saveCoachReply).toHaveBeenCalledWith("conversation-id", "Which setups work best for me?", expect.any(String)));
  });

  it("shows a readable request error and retries the last message", async () => {
    requestCoachReply
      .mockRejectedValueOnce(new Error("OpenAI returned HTTP 429."))
      .mockResolvedValueOnce("Review your recorded sample.");
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "Let's work on my strategy" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("OpenAI returned HTTP 429.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Review your recorded sample.")).toBeInTheDocument();
    expect(requestCoachReply).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(saveCoachReply).toHaveBeenCalledWith("conversation-id", "Let's work on my strategy", "Review your recorded sample."));
  });

  it("starts a clean thread from New chat", async () => {
    loadLatestCoachConversation.mockResolvedValue({
      conversationId: "old-conversation",
      messages: [
        { id: "stored-user-id", role: "user", content: "Old question" },
        { id: "stored-assistant-id", role: "assistant", content: "Old answer" },
      ],
    });
    await renderReadyChat();
    expect(screen.getByText("Old question")).toBeInTheDocument();
    expect(screen.getByText("Old answer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    expect(screen.queryByText("Old question")).not.toBeInTheDocument();
    expect(screen.queryByText("Old answer")).not.toBeInTheDocument();
    expect(screen.getByText("What would you like to understand about your trading?")).toBeInTheDocument();
  });

  it("shows failed persistence as a non-blocking notice", async () => {
    requestCoachReply.mockResolvedValue("Reply still available here.");
    saveCoachReply.mockRejectedValue(new Error("Database is temporarily unavailable."));
    await renderReadyChat();

    fireEvent.click(screen.getByRole("button", { name: "How much do my rule breaks cost me?" }));

    expect(await screen.findByText("Reply still available here.")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Reply is available, but could not be saved: Database is temporarily unavailable.");
    expect(screen.getByRole("textbox", { name: "Ask your coach anything about your trading" })).toBeEnabled();
  });
});