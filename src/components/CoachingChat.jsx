import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";
import { buildCoachContext, MIN_COACH_TRADES } from "../services/coachContext";
import {
  formatTradeDraftReply,
  matchScreenshotIntent,
  matchTradeDraftIntent,
  mostRecentScreenshotTrade,
  screenshotHistoryText,
} from "../services/coachChatIntents";
import { loadTradeScreenshotSignedUrl } from "../services/tradeScreenshots";
import {
  addLatestBacktests,
  createCoachConversation,
  deleteCoachConversation,
  deleteCoachMessage,
  loadCoachConversation,
  loadCoachConversations,
  renameCoachConversation,
  requestCoachTitle,
  requestCoachReply,
  requestCoachScreenshotReply,
  requestCoachTradeDraft,
  saveCoachAssistantReply,
  saveCoachUserMessage,
  updateCoachUserMessage,
} from "../services/coachChat";
import { deriveConversationTitle, groupConversations, relativeConversationTime } from "../services/coachHistory";
import { cleanCoachTitle, isFullReportReply, suggestedFollowUps } from "../services/coachChatPresentation";
import "./CoachingChat.css";

const prompts = [
  "Let's work on my strategy",
  "Show me a full trading report of last week",
  "What's my biggest weakness?",
  "How much do my rule breaks cost me?",
  "Which setups work best for me?",
  "Compare my strategies",
];
const sessionNames = ["New York", "London", "Asia", "Overlap"];
const draftFieldLabels = [
  ["asset", "Asset"],
  ["direction", "Direction"],
  ["entry", "Entry"],
  ["exit", "Exit"],
  ["stopLoss", "Stop loss"],
  ["takeProfit", "Take profit"],
  ["pnl", "P&L"],
  ["date", "Date"],
  ["session", "Session"],
  ["strategyName", "Strategy"],
  ["versionNumber", "Version"],
];

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function chatHistory(messages) {
  return messages.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
}

function CoachMessage({ message, isLastAssistant, isLastUser, isLoading, onCopy, onEdit, onRegenerate, onFollowUp, onReviewDraft, onEditDraft, copied }) {
  const isUser = message.role === "user";
  return (
    <article className={`coach-message ${isUser ? "coach-message-user" : "coach-message-assistant"}`}>
      {!isUser && <span className="coach-avatar" aria-hidden="true">C</span>}
      <div className="coach-message-content">
        {isUser
          ? <p>{message.content}</p>
          : (
            <>
              {message.partial && <span className="coach-partial-label">Partial reply · stopped</span>}
              {message.content && <div className="coach-markdown"><ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => <div className="coach-markdown-table"><table>{children}</table></div>,
                }}
              >{message.content}</ReactMarkdown></div>}
              {message.draft && (
                <section className="coach-draft-card" aria-label="Trade draft">
                  <h3>Review trade draft</h3>
                  <dl>
                    {draftFieldLabels.map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{message.draft[key] ?? "Not stated"}</dd>
                      </div>
                    ))}
                    <div><dt>Conditions</dt><dd>{message.draft.conditions.length ? message.draft.conditions.join(", ") : "None stated"}</dd></div>
                    <div><dt>Indicators</dt><dd>{message.draft.indicators.length ? message.draft.indicators.join(", ") : "None stated"}</dd></div>
                  </dl>
                  <div className="coach-draft-actions">
                    <button type="button" onClick={() => onReviewDraft(message.draft)}>Review &amp; save</button>
                    <button type="button" onClick={() => onEditDraft(message.draftSourceText)}>Edit in chat</button>
                  </div>
                </section>
              )}
              {!message.content && isLoading && <span className="coach-stream-placeholder">Thinking...</span>}
            </>
          )}
        {isUser && isLastUser && !isLoading && (
          <div className="coach-message-actions">
            <button type="button" onClick={() => onEdit(message)}>Edit and resend</button>
          </div>
        )}
        {!isUser && (
          <div className="coach-message-actions">
            {message.content && <button type="button" onClick={() => onCopy(message)}>{copied ? "Copied" : isFullReportReply(message.content) ? "Copy report" : "Copy"}</button>}
            {isLastAssistant && !isLoading && <button type="button" onClick={() => onRegenerate(message)}>Regenerate</button>}
          </div>
        )}
        {!isUser && !isLoading && message.content && (
          <div className="coach-follow-up-chips" aria-label="Suggested follow-up questions">
            {suggestedFollowUps(message.content).slice(0, 3).map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => onFollowUp(suggestion)}>{suggestion}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CoachingChat({
  trades = [],
  strategyLibrary = [],
  screenshotConsentAcknowledged = false,
  onRequireScreenshotConsent = () => {},
  onReviewDraft = () => {},
}) {
  const [strategies, setStrategies] = useState(strategyLibrary);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [activeTitle, setActiveTitle] = useState("New chat");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [editingConversationId, setEditingConversationId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [actionMenuId, setActionMenuId] = useState("");
  const [chatError, setChatError] = useState("");
  const [persistenceNotice, setPersistenceNotice] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");
  const [selectedScreenshots, setSelectedScreenshots] = useState([]);
  const [screenshotPickerOpen, setScreenshotPickerOpen] = useState(false);
  const [screenshotUrls, setScreenshotUrls] = useState({});
  const [screenshotPickerError, setScreenshotPickerError] = useState("");
  const requestInFlight = useRef(false);
  const requestControllerRef = useRef(null);
  const activeTitleRef = useRef("New chat");
  const conversationIdRef = useRef("");
  const conversationExistsRef = useRef(false);
  const textareaRef = useRef(null);
  const threadRef = useRef(null);
  const retryOptionsRef = useRef(null);

  function updateActiveTitle(title) {
    activeTitleRef.current = title;
    setActiveTitle(title);
  }

  useEffect(() => {
    let active = true;
    addLatestBacktests(strategyLibrary)
      .then((enrichedStrategies) => {
        if (active) setStrategies(enrichedStrategies);
      })
      .catch((error) => {
        if (active) setPersistenceNotice(`Saved backtests could not be loaded: ${error.message}`);
      });
    return () => { active = false; };
  }, [strategyLibrary]);

  async function refreshConversations() {
    const updated = await loadCoachConversations();
    setConversations(updated);
    return updated;
  }

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      try {
        const list = await loadCoachConversations();
        if (!active) return;
        setConversations(list);
        const latest = list[0];
        if (latest) {
          setIsLoadingConversation(true);
          const loadedMessages = await loadCoachConversation(latest.id);
          if (!active) return;
          conversationIdRef.current = latest.id;
          setActiveConversationId(latest.id);
          conversationExistsRef.current = true;
          updateActiveTitle(latest.title);
          setMessages(loadedMessages.map((message) => ({ ...message, persisted: true })));
        } else {
          conversationIdRef.current = createId();
          setActiveConversationId(conversationIdRef.current);
          conversationExistsRef.current = false;
        }
      } catch (error) {
        if (!active) return;
        setHistoryError(error.message || "Could not load conversation history.");
        conversationIdRef.current = createId();
        setActiveConversationId(conversationIdRef.current);
        conversationExistsRef.current = false;
      } finally {
        if (active) {
          setIsHistoryLoading(false);
          setIsLoadingConversation(false);
        }
      }
    }
    loadHistory();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, isLoading]);

  const context = useMemo(() => buildCoachContext(trades, strategies), [trades, strategies]);
  const draftAllowLists = useMemo(() => ({
    sessions: sessionNames,
    conditions: SETUP_CONDITIONS.map(({ label }) => label),
    indicators: INDICATORS.map(({ name }) => name),
    strategies: strategyLibrary.map((strategy) => ({
      name: strategy.name,
      versions: (strategy.versions || [])
        .map((version) => Number(version.version))
        .filter((version) => Number.isInteger(version) && version > 0),
    })),
  }), [strategyLibrary]);
  const availableScreenshotTrades = useMemo(() => trades
    .filter((trade) => trade.screenshotPath)
    .sort((left, right) => (
      (Date.parse(right.createdAt || right.date || "") || 0)
      - (Date.parse(left.createdAt || left.date || "") || 0)
    ))
    .slice(0, 20), [trades]);
  const selectedScreenshotTrades = selectedScreenshots
    .map((id) => trades.find((trade) => trade.id === id))
    .filter(Boolean);

  useEffect(() => {
    if (!screenshotPickerOpen) return undefined;
    let active = true;
    const pending = availableScreenshotTrades.map(async (trade) => {
      try {
        const url = await loadTradeScreenshotSignedUrl(trade.screenshotPath);
        if (active) setScreenshotUrls((current) => ({ ...current, [trade.id]: url }));
      } catch (error) {
        if (active) setScreenshotPickerError(error.message || "Could not load a journal screenshot.");
      }
    });
    Promise.all(pending);
    return () => { active = false; };
  }, [availableScreenshotTrades, screenshotPickerOpen]);
  const hasEnoughTrades = context.totalTrades >= MIN_COACH_TRADES;
  const assistantIndexes = messages.flatMap((message, index) => message.role === "assistant" ? [index] : []);
  const userIndexes = messages.flatMap((message, index) => message.role === "user" ? [index] : []);
  const lastAssistantIndex = assistantIndexes[assistantIndexes.length - 1];
  const lastUserIndex = userIndexes[userIndexes.length - 1];

  function startNewChat() {
    if (requestInFlight.current) return;
    const id = createId();
    conversationIdRef.current = id;
    setActiveConversationId(id);
    conversationExistsRef.current = false;
    updateActiveTitle("New chat");
    setMessages([]);
    setDraft("");
    setSelectedScreenshots([]);
    setScreenshotPickerOpen(false);
    setChatError("");
    setPersistenceNotice("");
    setMobileHistoryOpen(false);
  }

  async function openConversation(conversation) {
    if (requestInFlight.current || conversation.id === conversationIdRef.current) {
      setMobileHistoryOpen(false);
      return;
    }
    setIsLoadingConversation(true);
    setChatError("");
    setHistoryError("");
    try {
      const loadedMessages = await loadCoachConversation(conversation.id);
      conversationIdRef.current = conversation.id;
      setActiveConversationId(conversation.id);
      conversationExistsRef.current = true;
      updateActiveTitle(conversation.title);
      setMessages(loadedMessages.map((message) => ({ ...message, persisted: true })));
      setDraft("");
      setSelectedScreenshots([]);
      setScreenshotPickerOpen(false);
      setMobileHistoryOpen(false);
    } catch (error) {
      setHistoryError(error.message || "Could not open this conversation.");
    } finally {
      setIsLoadingConversation(false);
    }
  }

  function beginRename(conversation) {
    setEditingConversationId(conversation.id);
    setRenameDraft(conversation.title);
    setActionMenuId("");
  }

  async function commitRename(conversation) {
    const title = renameDraft.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!title) return;
    try {
      const renamed = await renameCoachConversation(conversation.id, title);
      setConversations((current) => current.map((item) => item.id === renamed.id ? renamed : item));
      if (conversation.id === conversationIdRef.current) updateActiveTitle(renamed.title);
      setEditingConversationId("");
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message || "Could not rename this conversation.");
    }
  }

  async function removeConversation(conversation) {
    const shouldDelete = window.confirm(`Delete "${conversation.title}" and its messages? This cannot be undone.`);
    if (!shouldDelete) return;
    try {
      await deleteCoachConversation(conversation.id);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      setActionMenuId("");
      if (conversation.id === conversationIdRef.current) startNewChat();
    } catch (error) {
      setHistoryError(error.message || "Could not delete this conversation.");
    }
  }

  async function completeReply(text, history, appendUserMessage, persistUserMessage = appendUserMessage, replaceMessage = null, existingUserId = "", editUserMessage = null, requestOptions = {}) {
    if (requestInFlight.current || (!hasEnoughTrades && !requestOptions.mode) || isLoadingConversation) return;
    requestInFlight.current = true;
    retryOptionsRef.current = requestOptions.mode ? requestOptions : null;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsLoading(true);
    setChatError("");
    setPersistenceNotice("");
    const userDisplayId = appendUserMessage ? createId() : null;
    const displayedUserText = requestOptions.historyUserText || text;
    const assistantDisplayId = createId();
    const isFirstReply = appendUserMessage
      && !conversationExistsRef.current
      && !history.some((message) => message.role === "assistant");
    const provisionalTitle = deriveConversationTitle(displayedUserText);
    if (appendUserMessage) setMessages((current) => [...current, { id: userDisplayId, role: "user", content: displayedUserText, persisted: false }]);
    if (editUserMessage) {
      setMessages((current) => current.map((message) => message.id === editUserMessage.id
        ? { ...message, content: displayedUserText, persisted: false }
        : message));
    }
    setMessages((current) => [...current, {
      id: assistantDisplayId,
      role: "assistant",
      content: "",
      streaming: requestOptions.mode !== "draft_trade",
    }]);

    try {
      if (!conversationExistsRef.current) {
        const created = await createCoachConversation(conversationIdRef.current, provisionalTitle);
        conversationExistsRef.current = true;
        setActiveConversationId(created.id);
        updateActiveTitle(created.title);
        setConversations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      }
    } catch (error) {
      setPersistenceNotice(`Conversation could not be saved yet: ${error.message}`);
    }

    try {
      if (editUserMessage?.persisted && conversationExistsRef.current) {
        try {
          await updateCoachUserMessage(editUserMessage.id, text);
          setMessages((current) => current.map((message) => message.id === editUserMessage.id
            ? { ...message, persisted: true }
            : message));
        } catch (error) {
          setPersistenceNotice(`Your edited message could not be saved: ${error.message}`);
        }
      } else if (persistUserMessage && conversationExistsRef.current) {
        const savedUser = await saveCoachUserMessage(conversationIdRef.current, displayedUserText);
        const targetUserId = userDisplayId || existingUserId;
        setMessages((current) => current.map((message) => message.id === targetUserId
          ? { ...message, id: savedUser.id, persisted: true }
          : message));
      }
    } catch (error) {
      setPersistenceNotice(`Your message could not be saved, but coaching will continue: ${error.message}`);
    }

    try {
      const onToken = (reply) => setMessages((current) => current.map((message) => message.id === assistantDisplayId
        ? { ...message, content: reply, streaming: true }
        : message));
      let result;
      if (requestOptions.mode === "analyze_screenshot") {
        result = await requestCoachScreenshotReply({
          tradeIds: requestOptions.tradeIds,
          message: requestOptions.originalMessage || text,
          history,
          context,
          signal: controller.signal,
          onToken,
        });
      } else if (requestOptions.mode === "draft_trade") {
        result = await requestCoachTradeDraft(text, history, draftAllowLists);
      } else {
        result = await requestCoachReply(text, history, context, {
          signal: controller.signal,
          onToken,
        });
      }
      const draft = requestOptions.mode === "draft_trade" ? result : null;
      const reply = draft
        ? formatTradeDraftReply(draft)
        : typeof result === "string" ? result : result.reply;
      const stopped = typeof result === "object" && result.stopped === true;
      if (!stopped && (typeof reply !== "string" || !reply.trim())) {
        throw new Error("Coach returned an empty reply. Retry.");
      }
      const replyContent = stopped && reply
        ? `${reply}\n\n> _Partial response — stopped by you._`
        : reply;
      if (replyContent) {
        setMessages((current) => current.map((message) => message.id === assistantDisplayId
          ? {
            ...message,
            content: replyContent,
            partial: stopped,
            streaming: false,
            ...(draft ? { draft, draftSourceText: requestOptions.originalMessage || text } : {}),
          }
          : message));
      } else {
        setMessages((current) => current.filter((message) => message.id !== assistantDisplayId));
      }
      if (conversationExistsRef.current && replyContent) {
        try {
          const savedAssistant = await saveCoachAssistantReply(conversationIdRef.current, replyContent);
          setMessages((current) => current.map((message) => message.id === assistantDisplayId
            ? { ...message, id: savedAssistant.id, persisted: true }
            : message));
          if (replaceMessage?.id) {
            await deleteCoachMessage(replaceMessage.id);
            setMessages((current) => current.filter((message) => message.id !== replaceMessage.id));
          }
          const updated = await refreshConversations();
          const activeConversation = updated.find((item) => item.id === conversationIdRef.current);
          if (activeConversation) updateActiveTitle(activeConversation.title);
        } catch (error) {
          setPersistenceNotice(`Reply is available, but could not be saved: ${error.message}`);
        }
      } else if (replyContent) {
        setPersistenceNotice("Reply is available, but conversation storage is unavailable.");
      }
      if (isFirstReply && !requestOptions.mode && !stopped && conversationExistsRef.current && replyContent) {
        try {
          const titleSuggestion = cleanCoachTitle(await requestCoachTitle(text, replyContent, context));
          if (titleSuggestion && conversationIdRef.current === activeConversationId
            && activeTitleRef.current === provisionalTitle) {
            const renamed = await renameCoachConversation(conversationIdRef.current, titleSuggestion);
            updateActiveTitle(renamed.title);
            setConversations((current) => current.map((conversation) => (
              conversation.id === renamed.id ? renamed : conversation
            )));
          }
        } catch {
          // Keep the existing truncated title when title generation is unavailable.
        }
      }
      setEditingMessageId("");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Coach request failed. Please try again.");
      setMessages((current) => current.flatMap((message) => {
        if (message.id !== assistantDisplayId) return [message];
        return message.content ? [{ ...message, streaming: false }] : [];
      }));
    } finally {
      requestControllerRef.current = null;
      requestInFlight.current = false;
      setIsLoading(false);
    }
  }

  function sendMessage(value = draft) {
    const text = value.trim();
    if (!text || text.length > 2000 || requestInFlight.current) return;
    if (editingMessageId) {
      if (!hasEnoughTrades) {
        setChatError("Log 10 trades to use journal-based coaching.");
        return;
      }
      const userIndex = messages.findIndex((message) => message.id === editingMessageId);
      if (userIndex < 0) return;
      const editedMessage = messages[userIndex];
      const response = messages.slice(userIndex + 1).find((message) => message.role === "assistant");
      const history = chatHistory(messages.slice(0, userIndex));
      setDraft("");
      setEditingMessageId("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      completeReply(text, history, false, false, response, editedMessage.id, editedMessage);
      return;
    }
    const history = chatHistory(messages);
    if (matchTradeDraftIntent(text)) {
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      completeReply(text, history, true, true, null, "", null, { mode: "draft_trade", originalMessage: text });
      return;
    }
    const screenshotRequested = matchScreenshotIntent(text) || selectedScreenshots.length > 0;
    if (screenshotRequested) {
      const screenshotTrades = selectedScreenshotTrades.length
        ? selectedScreenshotTrades
        : matchScreenshotIntent(text) ? [mostRecentScreenshotTrade(trades)].filter(Boolean) : [];
      if (!screenshotTrades.length) {
        setChatError("No recent trade with a saved screenshot was found. Use Attach from journal to choose one.");
        return;
      }
      if (!screenshotConsentAcknowledged) {
        setChatError("");
        onRequireScreenshotConsent();
        return;
      }
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      const historyUserText = screenshotHistoryText(screenshotTrades);
      completeReply(text, history, true, true, null, "", null, {
        mode: "analyze_screenshot",
        tradeIds: screenshotTrades.map((trade) => trade.id),
        historyUserText,
        originalMessage: text,
      });
      setSelectedScreenshots([]);
      setScreenshotPickerOpen(false);
      return;
    }
    if (!hasEnoughTrades) {
      setChatError("Log 10 trades to use journal-based coaching. Trade drafts and saved screenshots are available now.");
      return;
    }
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    retryOptionsRef.current = null;
    completeReply(text, history, true);
  }

  function retryLastMessage() {
    if (!chatError || requestInFlight.current) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    const userIndex = messages.findIndex((message) => message.id === lastUser.id);
    const retryOptions = retryOptionsRef.current || {};
    completeReply(
      retryOptions.originalMessage || lastUser.content,
      chatHistory(messages.slice(0, userIndex)),
      false,
      !lastUser.persisted,
      null,
      lastUser.id,
      null,
      retryOptions,
    );
  }

  function regenerateMessage(message) {
    if (requestInFlight.current) return;
    const assistantIndex = messages.findIndex((item) => item.id === message.id);
    const userIndex = messages.slice(0, assistantIndex).findLastIndex((item) => item.role === "user");
    if (userIndex < 0) return;
    const userMessage = messages[userIndex];
    const history = chatHistory(messages.slice(0, userIndex));
    completeReply(userMessage.content, history, false, false, message);
  }

  function editLastUserMessage(message) {
    setDraft(message.content);
    setEditingMessageId(message.id);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
      }
    });
  }

  function stopGeneration() {
    requestControllerRef.current?.abort();
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessage(message.id);
      setTimeout(() => setCopiedMessage(""), 1500);
    } catch {
      setChatError("Clipboard access is unavailable in this browser.");
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function handleDraftChange(event) {
    const value = event.target.value.slice(0, 2000);
    setDraft(value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
  }

  function toggleScreenshotSelection(trade) {
    setScreenshotPickerError("");
    if (selectedScreenshots.includes(trade.id)) {
      setSelectedScreenshots((current) => current.filter((id) => id !== trade.id));
    } else if (selectedScreenshots.length >= 2) {
      setScreenshotPickerError("Attach up to two screenshots per message.");
    } else {
      setSelectedScreenshots((current) => [...current, trade.id]);
    }
  }

  function editDraftInChat(sourceText) {
    setDraft(sourceText || "");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const groupedConversations = groupConversations(conversations);

  return (
    <main className={`coaching-chat${historyOpen ? "" : " history-collapsed"}${mobileHistoryOpen ? " mobile-history-open" : ""}`}>
      {mobileHistoryOpen && <button className="coach-history-backdrop" type="button" aria-label="Close history" onClick={() => setMobileHistoryOpen(false)} />}
      <aside className="coach-history-panel" aria-label="Chat history">
        <header className="coach-history-header">
          <strong>History</strong>
          <button type="button" className="coach-history-close" aria-label="Close history" onClick={() => setMobileHistoryOpen(false)}>×</button>
        </header>
        <button type="button" className="coach-history-new" onClick={startNewChat} disabled={isLoading}>+ New chat</button>
        <div className="coach-history-list">
          {isHistoryLoading && <p className="coach-history-state">Loading history...</p>}
          {historyError && <div className="coach-history-error" role="alert"><span>{historyError}</span><button type="button" onClick={async () => {
            setHistoryError("");
            setIsHistoryLoading(true);
            try {
              const entries = await refreshConversations();
              if (entries.length && !conversationExistsRef.current) await openConversation(entries[0]);
            } catch (error) {
              setHistoryError(error.message || "Could not load conversation history.");
            } finally {
              setIsHistoryLoading(false);
            }
          }}>Retry</button></div>}
          {!isHistoryLoading && !historyError && conversations.length === 0 && <p className="coach-history-state">No past chats yet</p>}
          {groupedConversations.map((group) => <section className="coach-history-group" key={group.label}>
            <h2>{group.label}</h2>
            {group.conversations.map((conversation) => (
              <div className={`coach-history-row${conversation.id === activeConversationId ? " active" : ""}`} key={conversation.id}>
                {editingConversationId === conversation.id ? (
                  <form className="coach-history-rename" onSubmit={(event) => { event.preventDefault(); commitRename(conversation); }}>
                    <input autoFocus value={renameDraft} maxLength={60} onChange={(event) => setRenameDraft(event.target.value)} aria-label="Conversation title" onKeyDown={(event) => {
                      if (event.key === "Escape") setEditingConversationId("");
                    }} />
                    <div><button type="submit">Save</button><button type="button" onClick={() => setEditingConversationId("")}>Cancel</button></div>
                  </form>
                ) : (
                  <>
                    <button type="button" className="coach-history-open" onClick={() => openConversation(conversation)} aria-current={conversation.id === activeConversationId ? "page" : undefined}>
                      <span>{conversation.title}</span>
                      <small>{relativeConversationTime(conversation.updated_at)}</small>
                    </button>
                    <div className="coach-history-actions">
                      <button type="button" aria-label={`Actions for ${conversation.title}`} aria-expanded={actionMenuId === conversation.id} onClick={() => setActionMenuId((current) => current === conversation.id ? "" : conversation.id)}>⋯</button>
                      {actionMenuId === conversation.id && <div className="coach-history-menu">
                        <button type="button" onClick={() => beginRename(conversation)}>Rename</button>
                        <button type="button" onClick={() => removeConversation(conversation)}>Delete</button>
                      </div>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </section>)}
        </div>
      </aside>

      <section className="coach-main">
        <header className="coach-header">
          <div className="coach-header-title">
            <button type="button" className="coach-history-toggle" onClick={() => {
              if (window.innerWidth <= 700) setMobileHistoryOpen((open) => !open);
              else setHistoryOpen((open) => !open);
            }}>History</button>
            <div><h1>Coach</h1><span>{context.totalTrades} trades</span></div>
          </div>
          <span className="coach-active-title" title={activeTitle}>{activeTitle === "New chat" ? "" : activeTitle}</span>
        </header>

        {!hasEnoughTrades && (
          <section className="coach-gate" aria-live="polite">
            <span className="coach-avatar coach-avatar-large" aria-hidden="true">C</span>
            <h2>Log 10 trades to start coaching ({context.totalTrades}/10)</h2>
            <p>Journal-pattern questions need 10 trades. You can still review a saved screenshot or prepare a trade draft.</p>
          </section>
        )}
        <section className="coach-thread" ref={threadRef} aria-label="Coach conversation" aria-live="polite">
          {isLoadingConversation && <p className="coach-thread-status">Loading conversation...</p>}
          {hasEnoughTrades && !messages.length && !isLoadingConversation && (
            <div className="coach-welcome">
              <span className="coach-avatar coach-avatar-large" aria-hidden="true">C</span>
              <h2>What would you like to understand about your trading?</h2>
              <p>I’ll use your journal data and label small samples as tentative.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <CoachMessage
              key={message.id}
              message={message}
              isLastAssistant={index === lastAssistantIndex}
              isLastUser={index === lastUserIndex}
              isLoading={isLoading}
              onCopy={copyMessage}
              onEdit={editLastUserMessage}
              onRegenerate={regenerateMessage}
              onFollowUp={(prompt) => sendMessage(prompt)}
              onReviewDraft={onReviewDraft}
              onEditDraft={editDraftInChat}
              copied={copiedMessage === message.id}
            />
          ))}
          {chatError && <div className="coach-chat-error" role="alert"><span>{chatError}</span><button type="button" onClick={retryLastMessage} disabled={isLoading}>Retry</button></div>}
        </section>

        <footer className="coach-composer-area">
          <div className={`coach-prompt-chips${messages.length ? " compact" : ""}`} aria-label="Example prompts">
            {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => sendMessage(
              prompt === "Compare my strategies"
                ? "Compare my strategy versions using forward and backtest results."
                : prompt,
            )} disabled={isLoading || isLoadingConversation}>{prompt}</button>)}
          </div>
          {persistenceNotice && <p className="coach-persistence-notice" role="status">{persistenceNotice}</p>}
          {editingMessageId && (
            <div className="coach-editing-notice">
              <span>Editing your last message</span>
              <button type="button" onClick={() => { setEditingMessageId(""); setDraft(""); }}>Cancel</button>
            </div>
          )}
          {selectedScreenshotTrades.length > 0 && (
            <div className="coach-screenshot-chips" aria-label="Attached journal screenshots">
              {selectedScreenshotTrades.map((trade) => (
                <span className="coach-screenshot-chip" key={trade.id}>
                  {trade.asset} · {trade.date}
                  <button type="button" aria-label={`Remove ${trade.asset} screenshot`} onClick={() => setSelectedScreenshots((current) => current.filter((id) => id !== trade.id))}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="coach-composer">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleComposerKeyDown}
              maxLength={2000}
              rows={1}
              placeholder="Ask your coach anything about your trading"
              aria-label="Ask your coach anything about your trading"
              disabled={isLoading || isLoadingConversation}
            />
            {isLoading && messages.some((message) => message.streaming) ? (
              <button type="button" onClick={stopGeneration} aria-label="Stop generating">Stop</button>
            ) : isLoading ? (
              <button type="button" disabled>Working...</button>
            ) : (
              <button type="button" onClick={() => sendMessage()} disabled={isLoadingConversation || !draft.trim()} aria-label="Send message">
                {editingMessageId ? "Resend" : "Send"}
              </button>
            )}
            <small>{draft.length}/2000</small>
          </div>
          <button
            className="coach-attach-screenshot"
            type="button"
            onClick={() => {
              setScreenshotPickerError("");
              setScreenshotPickerOpen(true);
            }}
            disabled={isLoading || isLoadingConversation}
          >
            Attach from journal
          </button>
          <p className="coach-disclaimer">Journal-based patterns, not financial advice.</p>
        </footer>
        {screenshotPickerOpen && (
          <div className="coach-screenshot-picker-backdrop" role="presentation" onClick={() => setScreenshotPickerOpen(false)}>
            <section
              className="coach-screenshot-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="coach-screenshot-picker-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div><p className="eyebrow">PRIVATE JOURNAL IMAGES</p><h2 id="coach-screenshot-picker-title">Attach from journal</h2></div>
                <button type="button" aria-label="Close screenshot picker" onClick={() => setScreenshotPickerOpen(false)}>×</button>
              </header>
              <p>Select up to two recent trades with saved screenshots.</p>
              {screenshotPickerError && <p role="alert">{screenshotPickerError}</p>}
              {!availableScreenshotTrades.length && <p>No recent trades have a saved screenshot.</p>}
              <div className="coach-screenshot-list">
                {availableScreenshotTrades.map((trade) => (
                  <button
                    type="button"
                    key={trade.id}
                    className={`coach-screenshot-option${selectedScreenshots.includes(trade.id) ? " selected" : ""}`}
                    aria-pressed={selectedScreenshots.includes(trade.id)}
                    aria-label={`${selectedScreenshots.includes(trade.id) ? "Remove" : "Select"} screenshot for ${trade.asset} ${trade.date}`}
                    onClick={() => toggleScreenshotSelection(trade)}
                  >
                    {screenshotUrls[trade.id]
                      ? <img src={screenshotUrls[trade.id]} alt={`${trade.asset} trade screenshot thumbnail`} />
                      : <span className="coach-screenshot-thumbnail-placeholder">Loading image</span>}
                    <span><strong>{trade.asset}</strong><small>{trade.date} · P&amp;L {trade.pnl ?? "not recorded"}</small></span>
                    <span className="coach-screenshot-selected">{selectedScreenshots.includes(trade.id) ? "Selected" : "Select"}</span>
                  </button>
                ))}
              </div>
              <div className="coach-screenshot-picker-actions">
                <button type="button" onClick={() => setScreenshotPickerOpen(false)}>Cancel</button>
                <button type="button" onClick={() => setScreenshotPickerOpen(false)} disabled={!selectedScreenshots.length}>Done</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default CoachingChat;