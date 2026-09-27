export const supportedHistoricalTimeframes = [
  { value: "1m", multiplier: 1, timespan: "minute" },
  { value: "5m", multiplier: 5, timespan: "minute" },
  { value: "15m", multiplier: 15, timespan: "minute" },
  { value: "1h", multiplier: 1, timespan: "hour" },
  { value: "4h", multiplier: 4, timespan: "hour" },
  { value: "1d", multiplier: 1, timespan: "day" },
  { value: "1w", multiplier: 1, timespan: "week" },
] as const;

export const massiveAggregateResultLimit = 50000;

export function parseTimeframe(timeframe: string): { multiplier: number; timespan: string } {
  const match = supportedHistoricalTimeframes.find(({ value }) => value === timeframe);
  if (!match) {
    const supportedValues = supportedHistoricalTimeframes.map(({ value }) => value).join(", ");
    throw new Error(`Unsupported timeframe "${timeframe}". Choose one of: ${supportedValues}.`);
  }

  return { multiplier: match.multiplier, timespan: match.timespan };
}

export function buildMassiveAggregateUrl(
  asset: string,
  timeframe: string,
  startDate: string,
  endDate: string,
): URL {
  const { multiplier, timespan } = parseTimeframe(timeframe);
  const url = new URL(
    `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(asset)}/range/${multiplier}/${timespan}/${startDate}/${endDate}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", String(massiveAggregateResultLimit));
  return url;
}