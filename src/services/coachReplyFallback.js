export const EMPTY_COACH_REPLY_ERROR = "Coach returned an empty reply. Retry.";

function replyText(result) {
  return typeof result === "string" ? result : result?.reply;
}

export async function requestWithStreamFallback({ streamRequest, completeRequest, onFallback = () => {} }) {
  try {
    const streamed = await streamRequest();
    if (streamed?.stopped) return streamed;
    const reply = replyText(streamed);
    if (typeof reply === "string" && reply.trim()) return { ...streamed, reply };
  } catch {
    // A failed stream gets one non-streaming attempt.
  }

  onFallback();
  const completed = await completeRequest();
  const reply = replyText(completed);
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error(EMPTY_COACH_REPLY_ERROR);
  }
  return { ...completed, reply, fallback: true };
}
