function numeric(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampFor(trade, fallback) {
  const date = String(trade?.date ?? "").slice(0, 10);
  const time = String(trade?.time ?? "").slice(0, 8);
  const parsed = new Date(`${date}T${time || "12:00:00"}Z`).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildJournalTimeline(trades = []) {
  const rows = [];
  const references = [];
  let plottedTradeCount = 0;
  trades.forEach((trade, index) => {
    const entry = numeric(trade.entry);
    const exit = numeric(trade.exit);
    if (entry === null) return;

    const entryTime = timestampFor(trade, Date.UTC(2000, 0, index + 1));
    const exitTime = Math.max(entryTime + 60_000, timestampFor(
      { ...trade, time: trade.exitTime || trade.time },
      entryTime + 3_600_000,
    ));
    const seriesKey = `trade-${index}`;
    const metadata = { direction: trade.direction || "", pnl: numeric(trade.pnl) };
    rows.push({ timestamp: entryTime, [seriesKey]: entry, trade: metadata });
    if (exit !== null) rows.push({ timestamp: exitTime, [seriesKey]: exit, trade: metadata });
    plottedTradeCount += 1;

    const midTime = entryTime + Math.floor((exitTime - entryTime) / 2);
    [["stopLoss", "SL"], ["takeProfit", "TP"]].forEach(([field, label]) => {
      const price = numeric(trade[field]);
      if (price !== null) references.push({ key: `${seriesKey}-${label}`, start: midTime, end: midTime + 60_000, price, label });
    });
  });

  rows.sort((left, right) => left.timestamp - right.timestamp);
  return {
    rows,
    references,
    plottedTradeCount,
    series: rows.flatMap((row) => Object.keys(row).filter((key) => key.startsWith("trade-")))
      .filter((key, index, all) => all.indexOf(key) === index)
      .map((key) => ({ key })),
  };
}
