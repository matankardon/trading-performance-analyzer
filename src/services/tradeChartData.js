export function getTradeChartWindow(bars, trade, padding = 10) {
  if (!Array.isArray(bars) || !trade) return [];
  const startIndex = Math.max(0, trade.entryIndex - padding);
  const endIndex = Math.min(bars.length, trade.exitIndex + padding + 1);
  return bars.slice(startIndex, endIndex).map((bar, offset) => ({
    ...bar,
    sourceIndex: startIndex + offset,
  }));
}
