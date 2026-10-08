const REPORT_HEADINGS = ["Summary", "Performance", "Strengths", "Weaknesses", "Rule Adherence", "Strategy Notes", "Focus Next"];

export function isFullReportReply(markdown) {
  const headings = new Set(
    [...String(markdown ?? "").matchAll(/^#{1,3}\s+(.+?)\s*#*$/gm)]
      .map((match) => match[1].trim().toLowerCase()),
  );
  return REPORT_HEADINGS.filter((heading) => headings.has(heading.toLowerCase())).length >= 3;
}

export function suggestedFollowUps(reply) {
  const text = String(reply ?? "").toLowerCase();
  if (isFullReportReply(reply)) {
    return ["Compare to last month", "What should I fix first?"];
  }
  if (/\b(strategy|backtest|rule change|testable rule|forward test)\b/.test(text)) {
    return ["Turn this into a testable rule"];
  }
  if (/\b(rule break|rule adherence|compliance)\b/.test(text)) {
    return ["Which rule break costs me most?", "How does this vary by session?"];
  }
  return ["Show me a full trading report", "Compare my strategies", "What should I focus on next?"];
}

export function cleanCoachTitle(value) {
  const words = String(value ?? "").replace(/[\r\n\t]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return words.join(" ").replace(/^["'`]+|["'`]+$/g, "").slice(0, 60);
}
