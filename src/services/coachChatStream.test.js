import { describe, expect, it, vi } from "vitest";
import { readOpenAiSseStream } from "./coachChatStream";

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)));
      controller.close();
    },
  });
}

describe("OpenAI SSE response parsing", () => {
  it("parses token events split across arbitrary chunks", async () => {
    const updates = [];
    const stream = streamOf([
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    await expect(readOpenAiSseStream(stream, (reply) => updates.push(reply)))
      .resolves.toMatchObject({ reply: "Hello world", stopped: false, tokenCount: 2 });
    expect(updates).toEqual(["Hello", "Hello world"]);
  });

  it("parses OpenAI chat-completions SSE fixture framing through [DONE]", async () => {
    const updates = [];
    const realUpstreamBytes = [
      'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1720000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\r\n\r\n',
      'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1720000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"Coaching"},"finish_reason":null}]}\r\n\r\n',
      'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1720000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ].join("");
    const stream = streamOf([
      realUpstreamBytes.slice(0, 27),
      realUpstreamBytes.slice(27, 79),
      realUpstreamBytes.slice(79),
    ]);
    await expect(readOpenAiSseStream(stream, (reply) => updates.push(reply)))
      .resolves.toMatchObject({ reply: "Coaching", stopped: false, tokenCount: 1 });
    expect(updates).toEqual(["Coaching"]);
  });

  it("supports LF framing, comments, and multiple data lines in one event", async () => {
    const stream = streamOf([
      ': keepalive\n',
      'data: {"choices":[\n',
      'data: {"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    await expect(readOpenAiSseStream(stream)).resolves.toMatchObject({
      reply: "Hello",
      stopped: false,
      tokenCount: 1,
    });
  });

  it("reports a valid [DONE]-only stream as zero parsed tokens with a raw prefix", async () => {
    const stream = streamOf(["data: [DONE]\r\n\r\n"]);
    await expect(readOpenAiSseStream(stream)).resolves.toMatchObject({
      reply: "",
      stopped: false,
      tokenCount: 0,
      firstRawChunk: "data: [DONE]\r\n\r\n",
    });
  });

  it("returns generated text as a partial reply when stopped", async () => {
    const controller = new AbortController();
    let enqueueToken;
    const stream = new ReadableStream({
      start(readableController) {
        enqueueToken = () => readableController.enqueue(new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
        ));
      },
    });
    const onToken = vi.fn(() => controller.abort());
    enqueueToken();
    const result = await readOpenAiSseStream(stream, onToken, controller.signal);
    expect(result).toMatchObject({ reply: "Partial", stopped: true, tokenCount: 1 });
  });

  it("surfaces explicit error events to enable non-streaming fallback", async () => {
    const stream = streamOf(['data: {"error":{"message":"stream failed"}}\n\n']);
    await expect(readOpenAiSseStream(stream)).rejects.toThrow("stream failed");
  });
});
