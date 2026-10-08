export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidScreenshotTradeIds(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 2
    && value.every((id) => typeof id === "string" && uuidPattern.test(id))
    && new Set(value).size === value.length;
}

export function hasSavedScreenshot(trade: unknown): trade is Record<string, unknown> & { screenshot_path: string } {
  return typeof trade === "object"
    && trade !== null
    && "screenshot_path" in trade
    && typeof trade.screenshot_path === "string"
    && trade.screenshot_path.length > 0;
}

export async function screenshotMimeType(blob: Blob): Promise<string | null> {
  if (blob.size === 0 || blob.size > MAX_SCREENSHOT_BYTES) return null;
  const type = blob.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return null;
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const isPng = type === "image/png"
    && bytes.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const isJpeg = type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = type === "image/webp"
    && bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const isGif = type === "image/gif"
    && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)));
  return isPng || isJpeg || isWebp || isGif ? type : null;
}

export function encodeScreenshot(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
