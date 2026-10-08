import { describe, expect, it } from "vitest";
import { buildScreenshotAnalysisRequestBody } from "./coachChatRequestPayloads";

describe("buildScreenshotAnalysisRequestBody", () => {
  it("sends screenshot trade IDs and text only, never image bytes or signed URLs", () => {
    const body = buildScreenshotAnalysisRequestBody({
      tradeIds: ["11111111-1111-4111-8111-111111111111"],
      message: "Describe the selected chart.",
      history: [{ role: "user", content: "Earlier text" }],
      context: { totalTrades: 1 },
      stream: true,
    });
    const serialized = JSON.stringify(body);
    expect(body).toMatchObject({
      mode: "analyze_screenshot",
      tradeIds: ["11111111-1111-4111-8111-111111111111"],
      stream: true,
    });
    expect(serialized).not.toMatch(/imageData|base64|signedUrl|https?:\/\/|storagePath/);
  });
});
