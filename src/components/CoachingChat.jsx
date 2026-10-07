import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildCoachContext, MIN_COACH_TRADES } from "../services/coachContext";
import {
  addLatestBacktests,
  deleteCoachMessage,
  loadLatestCoachConversation,
  requestCoachReply,
  saveCoachReply,
} from "../services/coachChat";
import "./CoachingChat.css";

const prompts = [
  "Let's work on my strategy",
  "Show me a full trading report of last week",
  "What's my biggest weakness?",
  "How much do my rule breaks cost me?",
  "Which setups work best for me?",
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

function CoachMessage({ message, isLastAssistant, onCopy, onRegenerate, copied }) {
  const isUser = message.role === "user";
  return (
    <article className={`coach-message ${isUser ? "coach-message-user" : "coach-message-assistant"}`}>
      {!isUser && <span className="coach-avatar" aria-hidden="true">C</span>}
      <div className="coach-message-content">
        {isUser
          ? <p>{message.content}</p>
          : <div className="coach-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>}
        {!isUser && (
          <div className="coach-message-actions">
            <button type="button" onClick={() => onCopy(message)}>{copied ? "Copied" : "Copy"}</button>
            {isLastAssistant && <button type="button" onClick={() => onRegenerate(message)}>Regenerate</button>}
          </div>
        )}
      </div>
    </article>
  );
}

function CoachingChat({ trades = [], strategyLibrary = [] }) {
  const [strategies, setStrategies] = useState(strategyLibrary);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [chatError, setChatError] = useState("");
  const [persistenceNotice, setPersistenceNotice] = useState("");
  const [copiedMessage, setCopiedMessage] = useState("");
  const requestInFlight = useRef(false);
  const conversationIdRef = useRef("");
  const textareaRef = useRef(null);
  const threadRef = useRef(null);

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

  useEffect(() => {
    let active = true;
    loadLatestCoachConversation()
      .then((conversation) => {
        if (!active) return;
        const id = conversation.conversationId || createId();
        conversationIdRef.current = id;
        setMessages(conversation.messages);
      })
      .catch((error) => {
        if (!active) return;
        const id = createId();
        conversationIdRef.current = id;
        setPersistenceNotice(`Saved conversation could not be loaded: ${error.message}`);
      })
      .finally(() => {
        if (active) setIsLoadingConversation(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, isLoading]);

  const context = useMemo(() => buildCoachContext(trades, strategies), [trades, strategies]);
  const hasEnoughTrades = context.totalTrades >= MIN_COACH_TRADES;
  const assistantIndexes = messages.flatMap((message, index) => message.role === "assistant" ? [index] : []);
  const lastAssistantIndex = assistantIndexes[assistantIndexes.length - 1];

  function startNewChat() {
    if (requestInFlight.current) return;
    const id = createId();
    conversationIdRef.current = id;
    setMessages([]);
    setDraft("");
    setChatError("");
    setPersistenceNotice("");
  }

  async function completeReply(text, history, appendUserMessage, persistUserMessage = appendUserMessage, replaceMessage = null) {
    if (requestInFlight.current || !hasEnoughTrades || isLoadingConversation) return;
    requestInFlight.current = true;
    setIsLoading(true);
    setChatError("");
    setPersistenceNotice("");
    const userDisplayId = appendUserMessage ? createId() : null;
    const assistantDisplayId = createId();
    if (appendUserMessage) setMessages((current) => [...current, { id: userDisplayId, role: "user", content: text }]);

    try {
      const reply = await requestCoachReply(text, history, context);
      setMessages((current) => [...current, { id: assistantDisplayId, role: "assistant", content: reply }]);
      try {
        const saved = await saveCoachReply(conversationIdRef.current, persistUserMessage ? text : null, reply);
        const savedAssistantId = saved.find((item) => item.role === "assistant")?.id;
        if (savedAssistantId) {
          setMessages((current) => current.map((message) => message.id === assistantDisplayId
            ? { ...message, id: savedAssistantId }
            : message));
        }
        if (replaceMessage?.id) {
          await deleteCoachMessage(replaceMessage.id);
          setMessages((current) => current.filter((message) => message.id !== replaceMessage.id));
        }
      } catch (error) {
        setPersistenceNotice(`Reply is available, but could not be saved: ${error.message}`);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Coach request failed. Please try again.");
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  }

  function sendMessage(value = draft) {
    const text = value.trim();
    if (!text || text.length > 2000 || requestInFlight.current || !hasEnoughTrades) return;
    const history = chatHistory(messages);
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    completeReply(text, history, true);
  }

  function retryLastMessage() {
    if (!chatError || requestInFlight.current) return;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    const userIndex = messages.findIndex((message) => message.id === lastUser.id);
    completeReply(lastUser.content, chatHistory(messages.slice(0, userIndex)), false, true);
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

  return (
    <main className="coaching-chat">
      <header className="coach-header">
        <div><h1>Coach</h1><span>{context.totalTrades} trades</span></div>
        <button type="button" className="coach-new-chat" onClick={startNewChat} disabled={isLoading}>New chat</button>
      </header>

      {!hasEnoughTrades ? (
        <section className="coach-gate" aria-live="polite">
          <span className="coach-avatar coach-avatar-large" aria-hidden="true">C</span>
          <h2>Log 10 trades to start coaching ({context.totalTrades}/10)</h2>
          <p>Your coach uses journaled results and context to discuss patterns in your trading.</p>
        </section>
      ) : (
        <>
          <section className="coach-thread" ref={threadRef} aria-label="Coach conversation" aria-live="polite">
            {isLoadingConversation && <p className="coach-thread-status">Loading conversation...</p>}
            {!messages.length && !isLoadingConversation && (
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
                onCopy={copyMessage}
                onRegenerate={regenerateMessage}
                copied={copiedMessage === message.id}
              />
            ))}
            {isLoading && <div className="coach-typing" role="status"><span className="coach-avatar" aria-hidden="true">C</span><span>Thinking...</span></div>}
            {chatError && <div className="coach-chat-error" role="alert"><span>{chatError}</span><button type="button" onClick={retryLastMessage} disabled={isLoading}>Retry</button></div>}
          </section>

          <footer className="coach-composer-area">
            <div className={`coach-prompt-chips${messages.length ? " compact" : ""}`} aria-label="Example prompts">
              {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => sendMessage(prompt)} disabled={isLoading || isLoadingConversation}>{prompt}</button>)}
            </div>
            {persistenceNotice && <p className="coach-persistence-notice" role="status">{persistenceNotice}</p>}
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
              <button type="button" onClick={() => sendMessage()} disabled={isLoading || isLoadingConversation || !draft.trim()} aria-label="Send message">Send</button>
              <small>{draft.length}/2000</small>
            </div>
            <p className="coach-disclaimer">Journal-based patterns, not financial advice.</p>
          </footer>
        </>
      )}
    </main>
  );
}

export default CoachingChat;