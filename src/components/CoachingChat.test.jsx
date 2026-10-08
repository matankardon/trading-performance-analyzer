import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import CoachingChat from "./CoachingChat";

const {
  addLatestBacktests,
  createCoachConversation,
  deleteCoachConversation,
  deleteCoachMessage,
  loadCoachConversation,
  loadCoachConversations,
  renameCoachConversation,
  requestCoachReply,
  requestCoachTitle,
  saveCoachAssistantReply,
  saveCoachUserMessage,
  updateCoachUserMessage,
} = vi.hoisted(() => ({
  addLatestBacktests: vi.fn(),
  createCoachConversation: vi.fn(),
  deleteCoachConversation: vi.fn(),
  deleteCoachMessage: vi.fn(),
  loadCoachConversation: vi.fn(),
  loadCoachConversations: vi.fn(),
  renameCoachConversation: vi.fn(),
  requestCoachReply: vi.fn(),
  requestCoachTitle: vi.fn(),
  saveCoachAssistantReply: vi.fn(),
  saveCoachUserMessage: vi.fn(),
  updateCoachUserMessage: vi.fn(),
}));

vi.mock("../services/coachChat", () => ({
  addLatestBacktests,
  createCoachConversation,
  deleteCoachConversation,
  deleteCoachMessage,
  loadCoachConversation,
  loadCoachConversations,
  renameCoachConversation,
  requestCoachReply,
  requestCoachTitle,
  saveCoachAssistantReply,
  saveCoachUserMessage,
  updateCoachUserMessage,
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
    createCoachConversation.mockReset().mockImplementation(async (id, title) => ({ id, title, created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T10:00:00Z" }));
    deleteCoachConversation.mockReset().mockResolvedValue(undefined);
    deleteCoachMessage.mockReset().mockResolvedValue(undefined);
    loadCoachConversation.mockReset().mockResolvedValue([]);
    loadCoachConversations.mockReset().mockResolvedValue([]);
    renameCoachConversation.mockReset().mockImplementation(async (id, title) => ({ id, title, created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T10:00:00Z" }));
    requestCoachReply.mockReset();
    requestCoachTitle.mockReset().mockRejectedValue(new Error("Title generation unavailable."));
    saveCoachAssistantReply.mockReset().mockResolvedValue({ id: "saved-assistant-id", role: "assistant" });
    saveCoachUserMessage.mockReset().mockResolvedValue({ id: "saved-user-id", role: "user" });
    updateCoachUserMessage.mockReset().mockResolvedValue(undefined);
    window.confirm = vi.fn(() => true);
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
    expect(requestCoachReply).toHaveBeenCalledWith("Which setups work best for me?", [], expect.objectContaining({ totalTrades: 10 }), expect.objectContaining({
      signal: expect.any(AbortSignal),
      onToken: expect.any(Function),
    }));
    expect(screen.getByRole("button", { name: "Stop generating" })).toBeInTheDocument();

    resolveReply("### Observed patterns\n\n- **Liquidity Sweep** appeared in the journal.");
    expect(await screen.findByRole("heading", { name: "Observed patterns" })).toBeInTheDocument();
    await waitFor(() => expect(createCoachConversation).toHaveBeenCalledWith(expect.any(String), "Which setups work best for me?"));
    expect(saveCoachUserMessage).toHaveBeenCalledWith(createCoachConversation.mock.calls[0][0], "Which setups work best for me?");
    await waitFor(() => expect(saveCoachAssistantReply).toHaveBeenCalledWith(createCoachConversation.mock.calls[0][0], expect.any(String)));
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
    await waitFor(() => expect(saveCoachAssistantReply).toHaveBeenCalledWith(createCoachConversation.mock.calls[0][0], "Review your recorded sample."));
  });

  it("shows a readable per-user rate-limit error", async () => {
    requestCoachReply.mockRejectedValue(new Error("Coach limit reached: 30 requests per hour. Please try again later."));
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "How much do my rule breaks cost me?" }));
    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Coach limit reached: 30 requests per hour. Please try again later.");
  });

  it("sends the complete strategy comparison request from its chip", async () => {
    requestCoachReply.mockResolvedValue("Strategy comparison details.");
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "Compare my strategies" }));
    await waitFor(() => expect(requestCoachReply).toHaveBeenCalledWith(
      "Compare my strategy versions using forward and backtest results.",
      [],
      expect.objectContaining({ totalTrades: 10 }),
      expect.any(Object),
    ));
  });

  it("streams a partial reply, lets the user stop, and persists it as partial", async () => {
    requestCoachReply.mockImplementation((_message, _history, _context, { signal, onToken }) => new Promise((resolve) => {
      onToken("A partial answer");
      signal.addEventListener("abort", () => resolve({ reply: "A partial answer", stopped: true }), { once: true });
    }));
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "Let's work on my strategy" }));
    expect(await screen.findByText("A partial answer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(await screen.findByText("Partial reply · stopped")).toBeInTheDocument();
    await waitFor(() => expect(saveCoachAssistantReply).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("Partial response — stopped by you."),
    ));
  });

  it("renders report tables, offers report follow-ups, and copies the full report", async () => {
    const report = "## Summary\nOne\n## Performance\nTwo\n## Strengths\nThree\n## Weaknesses\nFour\n\n| Group | P&L |\n| --- | ---: |\n| London | $10 |";
    requestCoachReply.mockResolvedValue(report);
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "Show me a full trading report of last week" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(document.querySelector(".coach-markdown-table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy report" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare to last month" }));
    await waitFor(() => expect(requestCoachReply).toHaveBeenCalledWith(
      "Compare to last month",
      expect.any(Array),
      expect.any(Object),
      expect.any(Object),
    ));
  });

  it("auto-titles a new conversation and preserves the provisional title on title failure", async () => {
    requestCoachReply.mockResolvedValue("Your journal has mixed results.");
    requestCoachTitle.mockResolvedValue("Weekly Results Review");
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "What's my biggest weakness?" }));
    await waitFor(() => expect(requestCoachTitle).toHaveBeenCalledWith(
      "What's my biggest weakness?",
      "Your journal has mixed results.",
      expect.objectContaining({ totalTrades: 10 }),
    ));
    await waitFor(() => expect(renameCoachConversation).toHaveBeenCalledWith(
      expect.any(String),
      "Weekly Results Review",
    ));
    expect(document.querySelector(".coach-active-title")).toHaveAttribute("title", "Weekly Results Review");

    requestCoachTitle.mockRejectedValue(new Error("temporary title failure"));
    fireEvent.click(screen.getByRole("button", { name: "+ New chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Which setups work best for me?" }));
    expect(await screen.findByText("Your journal has mixed results.")).toBeInTheDocument();
    await waitFor(() => expect(createCoachConversation).toHaveBeenLastCalledWith(
      expect.any(String),
      "Which setups work best for me?",
    ));
    expect(document.querySelector(".coach-active-title")).toHaveAttribute("title", "Which setups work best for me?");
  });

  it("edits and resends the last user message in place", async () => {
    const conversation = { id: "edit-conversation", title: "Original", created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T11:00:00Z" };
    loadCoachConversations.mockResolvedValue([conversation]);
    loadCoachConversation.mockResolvedValue([
      { id: "edit-user", role: "user", content: "Original question" },
      { id: "edit-assistant", role: "assistant", content: "Original answer" },
    ]);
    requestCoachReply.mockResolvedValue("Updated answer.");
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "Edit and resend" }));
    const composer = screen.getByRole("textbox", { name: "Ask your coach anything about your trading" });
    fireEvent.change(composer, { target: { value: "Revised question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Updated answer.")).toBeInTheDocument();
    expect(updateCoachUserMessage).toHaveBeenCalledWith("edit-user", "Revised question");
    expect(deleteCoachMessage).toHaveBeenCalledWith("edit-assistant");
    expect(screen.getByText("Revised question")).toBeInTheDocument();
  });

  it("starts a clean thread from New chat", async () => {
    const older = { id: "old-conversation", title: "Old question", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" };
    loadCoachConversations.mockResolvedValue([older]);
    loadCoachConversation.mockResolvedValue([
      { id: "stored-user-id", role: "user", content: "Old question" },
      { id: "stored-assistant-id", role: "assistant", content: "Old answer" },
    ]);
    await renderReadyChat();
    expect(screen.getAllByText("Old question")).toHaveLength(3);
    expect(screen.getByText("Old answer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ New chat" }));

    expect(screen.getAllByText("Old question")).toHaveLength(1);
    expect(screen.queryByText("Old answer")).not.toBeInTheDocument();
    expect(screen.getByText("What would you like to understand about your trading?")).toBeInTheDocument();
  });

  it("shows an empty history state and keeps an empty New chat unsaved", async () => {
    await renderReadyChat();
    expect(screen.getByText("No past chats yet")).toBeInTheDocument();
    expect(createCoachConversation).not.toHaveBeenCalled();
  });

  it("opens an older conversation and appends a new turn to that conversation", async () => {
    const latest = { id: "latest-conversation", title: "Latest topic", created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T11:00:00Z" };
    const older = { id: "older-conversation", title: "Older topic", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T11:00:00Z" };
    loadCoachConversations.mockResolvedValue([latest, older]);
    loadCoachConversation.mockImplementation(async (id) => id === older.id
      ? [{ id: "old-user-id", role: "user", content: "Older question", persisted: true }]
      : [{ id: "latest-user-id", role: "user", content: "Latest question", persisted: true }]);
    requestCoachReply.mockResolvedValue("Continued answer.");
    await renderReadyChat();
    fireEvent.click(screen.getByRole("button", { name: "Older topic 6d ago" }));
    expect(await screen.findByText("Older question")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Ask your coach anything about your trading" }), { target: { value: "Continue this" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Continued answer.")).toBeInTheDocument();
    expect(createCoachConversation).not.toHaveBeenCalled();
    expect(loadCoachConversation).toHaveBeenCalledWith("older-conversation");
    expect(saveCoachUserMessage).toHaveBeenCalledWith("older-conversation", "Continue this");
  });

  it("renames and deletes history rows, replacing a deleted active chat", async () => {
    const active = { id: "active-conversation", title: "Active", created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T11:00:00Z" };
    const other = { id: "other-conversation", title: "Other", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T11:00:00Z" };
    loadCoachConversations.mockResolvedValue([active, other]);
    loadCoachConversation.mockResolvedValue([{ id: "active-user-id", role: "user", content: "Question" }]);
    renameCoachConversation.mockImplementation(async (id, title) => ({ ...active, id, title, updated_at: "2026-10-07T12:00:00Z" }));
    await renderReadyChat();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Active" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Conversation title" }), { target: { value: "Renamed chat" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(renameCoachConversation).toHaveBeenCalledWith("active-conversation", "Renamed chat"));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Renamed chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteCoachConversation).toHaveBeenCalledWith("active-conversation"));
    expect(screen.queryByText("Question")).not.toBeInTheDocument();
  });

  it("shows failed persistence as a non-blocking notice", async () => {
    requestCoachReply.mockResolvedValue("Reply still available here.");
    saveCoachAssistantReply.mockRejectedValue(new Error("Database is temporarily unavailable."));
    await renderReadyChat();

    fireEvent.click(screen.getByRole("button", { name: "How much do my rule breaks cost me?" }));

    expect(await screen.findByText("Reply still available here.")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Reply is available, but could not be saved: Database is temporarily unavailable.");
    expect(screen.getByRole("textbox", { name: "Ask your coach anything about your trading" })).toBeEnabled();
  });
});