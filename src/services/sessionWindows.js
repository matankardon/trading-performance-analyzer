export const sessionWindows = {
  Asia: { start: 19 * 60, end: 4 * 60 },
  London: { start: 3 * 60, end: 12 * 60 },
  "New York": { start: 8 * 60, end: 17 * 60 },
  Overlap: { start: 8 * 60, end: 12 * 60 },
};

const NEW_YORK_TIME_ZONE = "America/New_York";
const newYorkTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NEW_YORK_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const newYorkDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NEW_YORK_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function minutesInNewYork(timestamp) {
  const parts = Object.fromEntries(
    newYorkTimeFormatter.formatToParts(new Date(timestamp))
      .filter(({ type }) => type === "hour" || type === "minute")
      .map(({ type, value }) => [type, Number(value)]),
  );
  return parts.hour * 60 + parts.minute;
}

export function isTimestampInSession(timestamp, session = "All sessions") {
  if (!session || session === "All sessions" || session === "All") return true;
  const window = sessionWindows[session];
  if (!window || !Number.isFinite(timestamp)) return false;
  const minutes = minutesInNewYork(timestamp);
  return window.start < window.end
    ? minutes >= window.start && minutes < window.end
    : minutes >= window.start || minutes < window.end;
}

export function formatNewYorkTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "-" : newYorkDateTimeFormatter.format(date);
}