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
      .resolves.toEqual({ reply: "Hello world", stopped: false });
    expect(updates).toEqual(["Hello", "Hello world"]);
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
    expect(result).toEqual({ reply: "Partial", stopped: true });
  });

  it("surfaces explicit error events to enable non-streaming fallback", async () => {
    const stream = streamOf(['data: {"error":{"message":"stream failed"}}\n\n']);
    await expect(readOpenAiSseStream(stream)).rejects.toThrow("stream failed");
  });
});
