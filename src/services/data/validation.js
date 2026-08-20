import { createDataError } from "./dataErrors";

function invalid(message, field = null) {
  return { valid: false, error: createDataError({ code: "INVALID_DATA", message, source: field }) };
}

export function validateTimestamp(timestamp, field = "timestamp") {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    return invalid(`Missing or invalid ${field}`, field);
  }
  return { valid: true };
}

export function validateBar(bar) {
  const timestampResult = validateTimestamp(bar?.timestamp, "bar timestamp");
  if (!timestampResult.valid) return timestampResult;

  const values = ["open", "high", "low", "close"];
  if (values.some((field) => typeof bar[field] !== "number" || !Number.isFinite(bar[field]))) {
    return invalid("OHLC values must be finite numbers", "ohlc");
  }
  if ([bar.open, bar.high, bar.low, bar.close].some((value) => value < 0)) {
    return invalid("OHLC values cannot be negative", "ohlc");
  }
  if (bar.high < bar.low || bar.high < bar.open || bar.high < bar.close || bar.low > bar.open || bar.low > bar.close) {
    return invalid("OHLC relationships are impossible", "ohlc");
  }
  if (bar.volume !== null && bar.volume !== undefined && (typeof bar.volume !== "number" || bar.volume < 0)) {
    return invalid("Volume must be a non-negative number", "volume");
  }
  return { valid: true };
}

export function validateBars(bars = []) {
  if (!Array.isArray(bars)) return invalid("Historical bars must be an array", "bars");
  const timestamps = new Set();
  for (const bar of bars) {
    const result = validateBar(bar);
    if (!result.valid) return result;
    if (timestamps.has(bar.timestamp)) return invalid("Duplicate historical bar timestamp", "timestamp");
    timestamps.add(bar.timestamp);
  }
  return { valid: true };
}

export function validateRequiredFields(record, fields = []) {
  const missing = fields.find((field) => record?.[field] === undefined || record?.[field] === null || record?.[field] === "");
  return missing ? invalid(`Missing required field: ${missing}`, missing) : { valid: true };
}
