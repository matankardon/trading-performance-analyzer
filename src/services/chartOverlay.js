function tradeDate(trade) {
  const date = String(trade?.date ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function numeric(value) {
  if (value === "" || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function rangeBounds(range = {}) {
  return {
    startDate: String(range.startDate ?? range.start ?? ""),
    endDate: String(range.endDate ?? range.end ?? ""),
  };
}

export function tradesToMarkers(trades, symbol, range = {}) {
  const selectedSymbol = String(symbol ?? "").trim().toUpperCase();
  const { startDate, endDate } = rangeBounds(range);
  const symbolTrades = (Array.isArray(trades) ? trades : []).filter((trade) => (
    String(trade?.asset ?? "").trim().toUpperCase() === selectedSymbol && selectedSymbol
  ));
  const selected = symbolTrades.filter((trade) => (
    tradeDate(trade)
    && (!startDate || tradeDate(trade) >= startDate)
    && (!endDate || tradeDate(trade) <= endDate)
  ));
  const skippedCount = symbolTrades.filter((trade) => (
    !tradeDate(trade)
    || (
      (!startDate || tradeDate(trade) >= startDate)
      && (!endDate || tradeDate(trade) <= endDate)
      && (numeric(trade?.entry) === null || numeric(trade?.exit) === null)
    )
  )).length;
  const eligibleTrades = selected.filter((trade) => (
    numeric(trade?.entry) !== null
    && numeric(trade?.exit) !== null
  ));

  const markers = eligibleTrades.flatMap((trade) => {
    const date = tradeDate(trade);
    const direction = String(trade.direction ?? "").toLowerCase();
    const isLong = direction === "long";
    const pnl = numeric(trade.pnl) ?? 0;
    const color = pnl > 0 ? "#78c995" : pnl < 0 ? "#df858d" : "#d4af37";
    return [
      {
        tradeId: trade.id ?? null,
        date,
        type: "entry",
        price: numeric(trade.entry),
        direction,
        pnl,
        color,
        position: isLong ? "belowBar" : "aboveBar",
        shape: isLong ? "arrowUp" : "arrowDown",
      },
      {
        tradeId: trade.id ?? null,
        date,
        type: "exit",
        price: numeric(trade.exit),
        direction,
        pnl,
        color,
        position: isLong ? "aboveBar" : "belowBar",
        shape: isLong ? "arrowDown" : "arrowUp",
      },
    ];
  });

  return { markers, trades: eligibleTrades, inRangeTrades: selected, skippedCount };
}

export function priceLinesForTrade(trade) {
  return [
    { price: numeric(trade?.stopLoss ?? trade?.stop_loss), label: "Stop loss", color: "#df858d" },
    { price: numeric(trade?.takeProfit ?? trade?.take_profit), label: "Target", color: "#78c995" },
  ].filter(({ price }) => price !== null);
}
