import { formatNewYorkTimestamp, isTimestampInSession } from "./sessionWindows";

describe("New York session windows", () => {
  it.each([
    ["Asia", "2024-01-08T00:00:00Z", true],
    ["Asia", "2024-01-08T10:00:00Z", false],
    ["London", "2024-01-08T08:00:00Z", true],
    ["London", "2024-01-08T18:00:00Z", false],
    ["New York", "2024-01-08T14:00:00Z", true],
    ["New York", "2024-01-08T22:00:00Z", false],
    ["Overlap", "2024-01-08T14:00:00Z", true],
    ["Overlap", "2024-01-08T17:00:00Z", false],
  ])("checks %s at %s", (session, timestamp, expected) => {
    expect(isTimestampInSession(Date.parse(timestamp), session)).toBe(expected);
  });

  it("handles New York daylight-saving time when checking the same local window", () => {
    expect(isTimestampInSession(Date.parse("2024-03-10T12:30:00Z"), "New York")).toBe(true);
    expect(isTimestampInSession(Date.parse("2024-03-10T11:30:00Z"), "New York")).toBe(false);
  });

  it("leaves All sessions ungated and formats timestamps in New York time", () => {
    expect(isTimestampInSession(Date.parse("2024-01-08T02:00:00Z"), "All sessions")).toBe(true);
    expect(formatNewYorkTimestamp(Date.parse("2024-01-08T14:05:00Z"))).toContain("09:05");
  });
});