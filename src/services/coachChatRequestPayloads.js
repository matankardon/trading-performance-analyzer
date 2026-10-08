export function buildScreenshotAnalysisRequestBody({ tradeIds, message, history, context, stream }) {
  return {
    mode: "analyze_screenshot",
    tradeIds,
    message,
    history: history.slice(-20),
    context,
    ...(typeof stream === "boolean" ? { stream } : {}),
  };
}
