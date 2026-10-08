import { describe, expect, it } from "vitest";
import { buildOpenAiRequestBody } from "./openAiRequest";

describe("OpenAI request payload", () => {
  it("enables streaming only for stream-mode requests", () => {
    const messages = [{ role: "user", content: "test" }];
    expect(buildOpenAiRequestBody("gpt-4o-mini", 1200, 0.3, messages, true))
      .toMatchObject({ model: "gpt-4o-mini", stream: true, messages });
    expect(buildOpenAiRequestBody("gpt-4o-mini", 1200, 0.3, messages, false))
      .not.toHaveProperty("stream");
  });
});
