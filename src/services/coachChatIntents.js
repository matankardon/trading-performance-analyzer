export function matchScreenshotIntent(message) {
  return /\b(?:look at|analy[sz]e|review|inspect|show me)\b[^.!?\n]{0,80}\b(?:last|latest|most recent)\s+trade(?:'s|’s)?\s+(?:saved\s+)?screenshot\b/i.test(message)
    || /\b(?:look at|analy[sz]e|review|inspect)\b[^.!?\n]{0,80}\b(?:this|attached|selected)\s+screenshot\b/i.test(message);
}

export function matchTradeDraftIntent(message) {
  return /\b(?:log|add)\s+(?:a\s+)?trade\b/i.test(message)
    || /\bi took (?:a|an) (?:trade|long|short)\b/i.test(message);
}

export function mostRecentScreenshotTrade(trades = []) {
  return trades
    .filter((trade) => typeof trade?.screenshotPath === "string" && trade.screenshotPath)
    .sort((left, right) => {
      const leftDate = Date.parse(left.createdAt || left.date || "") || 0;
      const rightDate = Date.parse(right.createdAt || right.date || "") || 0;
      return rightDate - leftDate;
    })[0] || null;
}

export function screenshotHistoryText(trades = []) {
  const summaries = trades.map(({ asset, date }) => {
    const safeAsset = Array.from(String(asset || "trade"), (character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? " " : character;
    }).join("")
      .replace(/https?:\/\/\S+/gi, "[redacted]")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
      .replace(/(?<![\w])(?:[A-Za-z]:)?\/?[\w.-]+(?:[\\/][\w.-]+)+(?![\w])/g, (path) => (
        /^[A-Z]{3}\/[A-Z]{3}$/.test(path) ? path : "[redacted]"
      ))
      .slice(0, 60);
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : "date not recorded";
    return `${safeAsset} ${safeDate}`;
  });
  return `Looked at screenshot of ${summaries.join(" and ")}`;
}

export function formatTradeDraftReply(draft) {
  const labels = {
    asset: "asset",
    direction: "direction",
    entry: "entry",
    exit: "exit",
    stopLoss: "stop loss",
    takeProfit: "take profit",
    pnl: "P&L",
    date: "date",
    session: "session",
    strategyName: "strategy",
    versionNumber: "strategy version",
  };
  const missing = Object.keys(labels).filter((field) => draft[field] === null);
  if (!Array.isArray(draft.conditions) || !draft.conditions.length) missing.push("conditions");
  if (!Array.isArray(draft.indicators) || !draft.indicators.length) missing.push("indicators");
  const missingLabels = { conditions: "conditions", indicators: "indicators" };
  return missing.length
    ? `Trade draft prepared. Not stated in your message: ${missing.map((field) => labels[field] || missingLabels[field]).join(", ")}. Review every field before saving.`
    : "Trade draft prepared. Review every field before saving.";
}
