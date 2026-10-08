import { describe, expect, it, vi } from "vitest";
import { EMPTY_COACH_REPLY_ERROR, requestWithStreamFallback } from "./coachReplyFallback";

describe("requestWithStreamFallback", () => {
  it("uses complete mode when an SSE stream finishes without tokens", async () => {
    const completeRequest = vi.fn().mockResolvedValue({ reply: "Recovered reply" });
    const onFallback = vi.fn();
    const result = await requestWithStreamFallback({
      streamRequest: async () => ({ reply: "", stopped: false }),
      completeRequest,
      onFallback,
    });
    expect(result).toMatchObject({ reply: "Recovered reply", fallback: true });
    expect(completeRequest).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("rejects a whitespace-only complete-mode result", async () => {
    await expect(requestWithStreamFallback({
      streamRequest: async () => ({ reply: "", stopped: false }),
      completeRequest: async () => ({ reply: " \n " }),
    })).rejects.toThrow(EMPTY_COACH_REPLY_ERROR);
  });

  it("does not retry intentionally stopped streams", async () => {
    const completeRequest = vi.fn();
    await expect(requestWithStreamFallback({
      streamRequest: async () => ({ reply: "Partial text", stopped: true }),
      completeRequest,
    })).resolves.toEqual({ reply: "Partial text", stopped: true });
    expect(completeRequest).not.toHaveBeenCalled();
  });
});
