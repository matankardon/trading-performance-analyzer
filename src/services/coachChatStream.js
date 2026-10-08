export async function readOpenAiSseStream(stream, onToken = () => {}, signal) {
  if (!stream) throw new Error("Coach returned an empty stream.");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let tokenCount = 0;
  let firstRawChunk = "";
  let stopped = false;
  let eventData = [];

  const cancelReader = () => {
    stopped = true;
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  function processEvent() {
    const data = eventData.join("\n");
    eventData = [];
    if (!data || data === "[DONE]") return data === "[DONE]";

    let payload;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      const parseError = new Error("Coach returned an invalid streaming response.");
      parseError.cause = error;
      parseError.rawChunk = firstRawChunk;
      throw parseError;
    }
    if (payload.error) {
      const streamError = new Error(String(payload.error.message || payload.error));
      streamError.rawChunk = firstRawChunk;
      throw streamError;
    }
    const token = payload.choices?.[0]?.delta?.content;
    if (typeof token === "string" && token) {
      reply += token;
      tokenCount += 1;
      onToken(reply);
    }
    return false;
  }

  function processLine(line) {
    if (!line) return processEvent();
    if (line.startsWith(":")) return false;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") eventData.push(value);
    return false;
  }

  function consumeLines(final = false) {
    while (buffer.length) {
      const match = /\r\n|\r|\n/.exec(buffer);
      if (!match) break;
      if (match[0] === "\r" && match.index === buffer.length - 1 && !final) break;
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (processLine(line)) return true;
    }
    if (final && buffer.length) {
      const line = buffer;
      buffer = "";
      if (processLine(line)) return true;
    }
    return false;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!firstRawChunk) firstRawChunk = decoder.decode(value).slice(0, 120);
      buffer += decoder.decode(value, { stream: true });
      if (consumeLines()) {
        await reader.cancel().catch(() => {});
        return { reply, stopped: false, tokenCount, firstRawChunk };
      }
    }
    buffer += decoder.decode();
    if (consumeLines(true)) return { reply, stopped: false, tokenCount, firstRawChunk };
    if (eventData.length && processEvent()) return { reply, stopped: false, tokenCount, firstRawChunk };
    return { reply, stopped, tokenCount, firstRawChunk };
  } catch (error) {
    if (stopped || signal?.aborted) return { reply, stopped: true };
    if (error instanceof Error && !error.rawChunk) error.rawChunk = firstRawChunk;
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}
