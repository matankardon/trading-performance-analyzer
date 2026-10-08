import { supabase } from "../supabaseClient";
import { readOpenAiSseStream } from "./coachChatStream";
import { EMPTY_COACH_REPLY_ERROR, requestWithStreamFallback } from "./coachReplyFallback";

function readableFunctionError(error) {
  return error?.detail || error?.error || error?.message || "Coach request failed. Please try again.";
}

export async function addLatestBacktests(strategies) {
  const versionIds = (strategies || []).flatMap((strategy) => (
    (strategy.versions || []).map((version) => version.id).filter(Boolean)
  ));
  if (!versionIds.length) return strategies || [];

  const { data, error } = await supabase
    .from("backtest_results")
    .select("strategy_version_id,asset,timeframe,start_date,end_date,metrics,created_at")
    .in("strategy_version_id", versionIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Could not load saved backtests.");

  const latestByVersion = new Map();
  (data || []).forEach((row) => {
    if (!latestByVersion.has(row.strategy_version_id)) latestByVersion.set(row.strategy_version_id, {
      asset: row.asset,
      timeframe: row.timeframe,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
      metrics: row.metrics,
    });
  });

  return (strategies || []).map((strategy) => ({
    ...strategy,
    versions: (strategy.versions || []).map((version) => ({
      ...version,
      latestBacktestSummary: latestByVersion.get(version.id) || null,
    })),
  }));
}

export async function loadCoachConversations() {
  const { data, error } = await supabase
    .from("coach_conversations")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message || "Could not load conversation history.");
  return data || [];
}

export async function loadCoachConversation(conversationId) {
  const { data, error } = await supabase
    .from("coach_messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message || "Could not load saved messages.");
  return (data || [])
    .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
    .map((message) => ({ id: message.id, role: message.role, content: message.content }));
}

export async function createCoachConversation(id, title) {
  const { data, error } = await supabase
    .from("coach_conversations")
    .insert({ id, title })
    .select("id,title,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message || "Could not create this conversation.");
  return data;
}

export async function renameCoachConversation(id, title) {
  const { data, error } = await supabase
    .from("coach_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,title,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message || "Could not rename this conversation.");
  return data;
}

export async function deleteCoachConversation(id) {
  const { error } = await supabase.from("coach_conversations").delete().eq("id", id);
  if (error) throw new Error(error.message || "Could not delete this conversation.");
}

export async function saveCoachUserMessage(conversationId, content) {
  const { data, error } = await supabase
    .from("coach_messages")
    .insert({ conversation_id: conversationId, role: "user", content })
    .select("id,role")
    .single();
  if (error) throw new Error(error.message || "Could not save your message.");
  return data;
}

export async function saveCoachAssistantReply(conversationId, content) {
  const { data, error } = await supabase
    .from("coach_messages")
    .insert({ conversation_id: conversationId, role: "assistant", content })
    .select("id,role")
    .single();
  if (error) throw new Error(error.message || "Could not save the coach reply.");
  await touchCoachConversation(conversationId);
  return data;
}

async function touchCoachConversation(conversationId) {
  const { error } = await supabase
    .from("coach_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw new Error(error.message || "Could not update conversation time.");
}

export async function deleteCoachMessage(messageId) {
  if (!messageId) return;
  const { error } = await supabase.from("coach_messages").delete().eq("id", messageId);
  if (error) throw new Error(error.message || "Could not replace the saved reply.");
}

async function requestCoachReplyLegacy(message, history, context) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("A valid Supabase access token is required. Please sign in again.");

  const { data, error } = await supabase.functions.invoke("coach-chat", {
    body: { mode: "complete", message, history: history.slice(-20), context },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    let responseBody;
    try {
      responseBody = error.context?.clone ? await error.context.clone().json() : error.context;
    } catch {
      responseBody = null;
    }
    throw new Error(readableFunctionError(responseBody) || readableFunctionError(error));
  }
  if (typeof data?.reply !== "string" || data.ok !== true) {
    throw new Error(data?.error || "Coach returned an incomplete reply.");
  }
  if (!data.reply.trim()) throw new Error(EMPTY_COACH_REPLY_ERROR);
  return data.reply.trim();
}

class CoachHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function requestCoachReply(message, history, context, { signal, onToken = () => {} } = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("A valid Supabase access token is required. Please sign in again.");

  let responseStatus = null;
  let responseContentType = "unavailable";
  let shouldFallback = false;
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error("Coach streaming is not configured.");
    const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/coach-chat`, {
      method: "POST",
      signal,
      headers: {
        Authorization: "Bearer " + accessToken,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "stream", message, history: history.slice(-20), context }),
    });
    responseStatus = response.status;
    responseContentType = response.headers.get("Content-Type") || "missing";

    if (!response.ok) {
      let data;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      const messageText = readableFunctionError(data);
      if (response.status < 500) throw new CoachHttpError(messageText, response.status);
      shouldFallback = true;
    } else if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
      return await requestWithStreamFallback({
        streamRequest: () => readOpenAiSseStream(response.body, onToken, signal),
        completeRequest: () => requestCoachReplyLegacy(message, history, context),
        onFallback: () => {
          console.error("Coach streaming fallback", {
            status: responseStatus,
            contentType: responseContentType,
          });
          onToken("");
        },
      });
    } else {
      const data = await response.json();
      if (data?.ok === true && typeof data.reply === "string") {
        if (data.reply.trim()) {
          onToken(data.reply.trim());
          return { reply: data.reply.trim(), stopped: false };
        }
        shouldFallback = true;
      }
      if (response.status === 429) throw new CoachHttpError(data?.error || "Coach rate limit reached. Try again later.", 429);
      if (!shouldFallback) shouldFallback = true;
    }
  } catch (error) {
    if (signal?.aborted) return { reply: "", stopped: true };
    if (error instanceof CoachHttpError && error.status < 500) throw error;
    shouldFallback = true;
  }

  if (shouldFallback) {
    console.error("Coach streaming fallback", {
      status: responseStatus,
      contentType: responseContentType,
    });
    onToken("");
    const reply = await requestCoachReplyLegacy(message, history, context);
    onToken(reply);
    return { reply, stopped: false, fallback: true };
  }
  throw new Error("Coach request failed. Please try again.");
}

export async function requestCoachTitle(message, reply, context) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("A valid Supabase access token is required. Please sign in again.");
  const { data, error } = await supabase.functions.invoke("coach-chat", {
    body: {
      mode: "title",
      message: message.slice(0, 2000),
      history: [{ role: "assistant", content: reply.slice(0, 2000) }],
      context,
    },
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (error) {
    let responseBody;
    try {
      responseBody = error.context?.clone ? await error.context.clone().json() : error.context;
    } catch {
      responseBody = null;
    }
    throw new Error(readableFunctionError(responseBody) || readableFunctionError(error));
  }
  if (data?.ok !== true || typeof data.title !== "string" || !data.title.trim()) {
    throw new Error(data?.error || "Coach returned no conversation title.");
  }
  return data.title;
}

export async function updateCoachUserMessage(messageId, content) {
  const { error } = await supabase
    .from("coach_messages")
    .update({ content })
    .eq("id", messageId)
    .eq("role", "user");
  if (error) throw new Error(error.message || "Could not update your message.");
}