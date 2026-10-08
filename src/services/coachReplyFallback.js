export const EMPTY_COACH_REPLY_ERROR = "Coach returned an empty reply. Retry.";

function replyText(result) {
  return typeof result === "string" ? result : result?.reply;
}

export async function requestWithStreamFallback({ streamRequest, completeRequest, onFallback = () => {} }) {
  let streamFailure;
  try {
    const streamed = await streamRequest();
    if (streamed?.stopped) return streamed;
    const reply = replyText(streamed);
    const tokenCount = streamed?.tokenCount ?? (typeof reply === "string" && reply.length ? 1 : 0);
    if (tokenCount > 0 && typeof reply === "string" && reply.trim()) return { ...streamed, reply };
    streamFailure = {
      reason: "no tokens parsed",
      firstRawChunk: streamed?.firstRawChunk || "",
    };
  } catch (error) {
    streamFailure = {
      reason: `parse error: ${error instanceof Error ? error.message : String(error)}`,
      firstRawChunk: error?.rawChunk || "",
    };
  }

  onFallback(streamFailure || { reason: "no tokens parsed", firstRawChunk: "" });
  const completed = await completeRequest();
  const reply = replyText(completed);
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error(EMPTY_COACH_REPLY_ERROR);
  }
  return { ...completed, reply, fallback: true };
}
