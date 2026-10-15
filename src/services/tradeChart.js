const TRADE_CHART_TIMEFRAMES = Object.freeze(["1m", "5m", "15m", "1h", "4h", "1d"]);
const TIMEFRAME_ALIASES = Object.freeze({
  "1 MIN": "1m",
  "1 MINUTE": "1m",
  "5 MIN": "5m",
  "5 MINUTE": "5m",
  "15 MIN": "15m",
  "15 MINUTE": "15m",
  "60M": "1h",
  "60 MIN": "1h",
  "60 MINUTE": "1h",
  "1 HOUR": "1h",
  "4 HOUR": "4h",
  DAILY: "1d",
  DAY: "1d",
});

const TIMEFRAME_MILLISECONDS = Object.freeze({
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
});

function validUtcDate(dateText) {
  const match = String(dateText ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return timestamp;
}

function validUtcTime(timeText) {
  const match = String(timeText ?? "").match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return ((hour * 60 + minute) * 60 + second) * 1000;
}

function utcDayText(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function tradeChartTimeframe(trade) {
  const recorded = String(trade?.timeframe ?? "").trim();
  const direct = TRADE_CHART_TIMEFRAMES.find((timeframe) => timeframe.toLowerCase() === recorded.toLowerCase());
  if (direct) return direct;
  return TIMEFRAME_ALIASES[recorded.toUpperCase()] || "15m";
}

export function tradeChartTimeframes() {
  return TRADE_CHART_TIMEFRAMES;
}

export function tradeChartWindow(trade, timeframe = tradeChartTimeframe(trade)) {
  const dayStart = validUtcDate(trade?.date);
  if (dayStart === null) return null;

  const tradeTime = validUtcTime(trade?.time || trade?.trade_time);
  if (tradeTime === null) {
    const startTimestamp = dayStart - TIMEFRAME_MILLISECONDS["1d"];
    const endTimestamp = dayStart + 2 * TIMEFRAME_MILLISECONDS["1d"] - 1;
    return {
      startTimestamp,
      endTimestamp,
      startDate: utcDayText(startTimestamp),
      endDate: utcDayText(endTimestamp),
      entryTimestamp: null,
    };
  }

  const entryTimestamp = dayStart + tradeTime;
  const interval = TIMEFRAME_MILLISECONDS[timeframe] || TIMEFRAME_MILLISECONDS["15m"];
  const entryBarTimestamp = Math.floor(entryTimestamp / interval) * interval;
  const startTimestamp = entryBarTimestamp - 60 * interval;
  const endTimestamp = entryBarTimestamp + 120 * interval;
  return {
    startTimestamp,
    endTimestamp,
    startDate: utcDayText(startTimestamp),
    endDate: utcDayText(endTimestamp),
    entryTimestamp,
  };
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function tradeChartLevels(trade) {
  const entry = finiteNumber(trade?.entry);
  const stop = finiteNumber(trade?.stopLoss ?? trade?.stop_loss);
  const target = finiteNumber(trade?.takeProfit ?? trade?.take_profit);
  const exit = finiteNumber(trade?.exit);
  const stopDistance = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  const targetDistance = entry !== null && target !== null ? Math.abs(target - entry) : null;
  const calculatedRiskReward = stopDistance > 0 && targetDistance !== null
    ? targetDistance / stopDistance
    : null;
  const riskReward = finiteNumber(trade?.riskReward) ?? calculatedRiskReward;
  const pnl = finiteNumber(trade?.pnl);

  return {
    levels: [
      { key: "entry", label: "Entry", value: entry, color: "#d4af37" },
      { key: "stop", label: "Stop loss", value: stop, color: "#df858d" },
      { key: "target", label: "Target", value: target, color: "#78c995" },
      { key: "exit", label: "Exit", value: exit, color: "#8eb8e3" },
    ].filter(({ value }) => value !== null),
    riskReward,
    pnl,
  };
}

export function tradeChartEntryTimestamp(trade) {
  const dayStart = validUtcDate(trade?.date);
  const tradeTime = validUtcTime(trade?.time || trade?.trade_time);
  return dayStart === null || tradeTime === null ? null : dayStart + tradeTime;
}
