import { describe, expect, it } from "vitest";
import {
  encodeScreenshot,
  hasSavedScreenshot,
  screenshotMimeType,
  isValidScreenshotTradeIds,
  MAX_SCREENSHOT_BYTES,
} from "./screenshotAnalysis";

function imageBlob(bytes: Uint8Array, type: string): Blob {
  return {
    size: bytes.byteLength,
    type,
    slice(start = 0, end = bytes.byteLength) {
      const slice = bytes.slice(start, end);
      return { arrayBuffer: async () => slice.buffer };
    },
  } as Blob;
}

describe("coach screenshot input guards", () => {
  it("accepts one or two UUIDs and rejects malformed, duplicate, or oversized lists", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    expect(isValidScreenshotTradeIds([first])).toBe(true);
    expect(isValidScreenshotTradeIds([first, second])).toBe(true);
    expect(isValidScreenshotTradeIds(["not-a-uuid"])).toBe(false);
    expect(isValidScreenshotTradeIds([first, second, "33333333-3333-4333-8333-333333333333"])).toBe(false);
    expect(isValidScreenshotTradeIds([first, first])).toBe(false);
  });

  it("rejects trades without saved screenshot paths", () => {
    expect(hasSavedScreenshot({ screenshot_path: "user/trade.png" })).toBe(true);
    expect(hasSavedScreenshot({ screenshot_path: null })).toBe(false);
    expect(hasSavedScreenshot({})).toBe(false);
  });

  it("allows supported image files only under the screenshot size cap", async () => {
    const png = imageBlob(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png");
    expect(await screenshotMimeType(png)).toBe("image/png");
    expect(await screenshotMimeType(imageBlob(new TextEncoder().encode("text"), "text/plain"))).toBeNull();
    expect(await screenshotMimeType(imageBlob(new TextEncoder().encode("not png"), "image/png"))).toBeNull();
    expect(await screenshotMimeType(imageBlob(new Uint8Array(), "image/png"))).toBeNull();
    expect(await screenshotMimeType(imageBlob(new Uint8Array(MAX_SCREENSHOT_BYTES + 1), "image/png"))).toBeNull();
  });

  it("base64-encodes screenshot bytes", () => {
    expect(encodeScreenshot(new Uint8Array([65, 66, 67]))).toBe("QUJD");
  });
});
