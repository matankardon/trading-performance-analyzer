export async function readOpenAiSseStream(stream, onToken = () => {}, signal) {
  if (!stream) throw new Error("Coach returned an empty stream.");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let stopped = false;

  const cancelReader = () => {
    stopped = true;
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  function processEvent(event) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return data === "[DONE]";

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new Error("Coach returned an invalid streaming response.");
    }
    if (payload.error) throw new Error(String(payload.error.message || payload.error));
    const token = payload.choices?.[0]?.delta?.content;
    if (typeof token === "string" && token) {
      reply += token;
      onToken(reply);
    }
    return false;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.match(/\r?\n\r?\n/);
      while (boundary) {
        const index = boundary.index;
        const event = buffer.slice(0, index);
        buffer = buffer.slice(index + boundary[0].length);
        if (processEvent(event)) {
          await reader.cancel().catch(() => {});
          return { reply, stopped: false };
        }
        boundary = buffer.match(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) processEvent(buffer);
    return { reply, stopped };
  } catch (error) {
    if (stopped || signal?.aborted) return { reply, stopped: true };
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}
