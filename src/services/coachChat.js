import { supabase } from "../supabaseClient";

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

export async function loadLatestCoachConversation() {
  const { data: latest, error: latestError } = await supabase
    .from("coach_messages")
    .select("id,conversation_id,created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message || "Could not load saved conversations.");
  if (!latest) return { conversationId: null, messages: [] };

  const { data, error } = await supabase
    .from("coach_messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", latest.conversation_id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message || "Could not load saved messages.");
  return {
    conversationId: latest.conversation_id,
    messages: (data || [])
      .filter((message) => ["user", "assistant"].includes(message.role) && typeof message.content === "string")
      .map((message) => ({ id: message.id, role: message.role, content: message.content })),
  };
}

export async function saveCoachReply(conversationId, userMessage, assistantMessage) {
  const { data, error } = await supabase.from("coach_messages").insert([
    ...(userMessage === null ? [] : [{ conversation_id: conversationId, role: "user", content: userMessage }]),
    { conversation_id: conversationId, role: "assistant", content: assistantMessage },
  ]).select("id,role");
  if (error) throw new Error(error.message || "Could not save this conversation.");
  return data || [];
}

export async function deleteCoachMessage(messageId) {
  if (!messageId) return;
  const { error } = await supabase.from("coach_messages").delete().eq("id", messageId);
  if (error) throw new Error(error.message || "Could not replace the saved reply.");
}

export async function requestCoachReply(message, history, context) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("A valid Supabase access token is required. Please sign in again.");

  const { data, error } = await supabase.functions.invoke("coach-chat", {
    body: { message, history: history.slice(-20), context },
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
  return data.reply;
}