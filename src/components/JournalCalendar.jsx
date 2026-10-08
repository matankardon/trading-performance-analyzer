import { useEffect, useMemo, useRef, useState } from "react";
import { buildMonthGrid, dayStats, groupTradesByDay, monthStats, WEEK_START, weeklyStats } from "../services/journalCalendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function compactMoney(value, digits = 0) {
  const amount = Math.abs(value);
  const compact = amount >= 1000
    ? amount >= 10_000
      ? `${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`
      : amount.toLocaleString("en-US", { maximumFractionDigits: digits })
    : amount.toLocaleString("en-US", { maximumFractionDigits: digits });
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}$${compact}`;
}

function fullMoney(value) {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${CURRENCY_FORMAT.format(Math.abs(value))}`;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function readableDate(key) {
  return dateFromKey(key).toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function moveDate(key, amount) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function CalendarTradeRow({ trade, onViewTrade, onEditTrade, onDeleteTrade }) {
  const pnl = Number.isFinite(Number(trade.pnl)) ? Number(trade.pnl) : 0;
  return (
    <article className="journal-day-trade">
      <div className="journal-day-trade-main">
        <strong>{trade.asset || "Unspecified asset"}</strong>
        <span>{[trade.direction, trade.session, trade.strategy].filter(Boolean).join(" · ") || "Trade details not recorded"}</span>
        <span className={pnl > 0 ? "pnl-positive" : pnl < 0 ? "pnl-negative" : ""}>{fullMoney(pnl)}</span>
      </div>
      <div className="journal-day-trade-actions">
        <button type="button" onClick={() => onViewTrade(trade)}>View</button>
        <button type="button" onClick={() => onEditTrade(trade)}>Edit</button>
        <button type="button" onClick={() => onDeleteTrade(trade.id)}>Delete</button>
      </div>
    </article>
  );
}

function JournalCalendar({ trades, onAddTrade, onViewTrade, onEditTrade, onDeleteTrade }) {
  const today = localDateKey(new Date());
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [focusedDate, setFocusedDate] = useState("");
  const dayButtonRefs = useRef(new Map());
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const { byDate, missingDateCount } = useMemo(() => groupTradesByDay(trades), [trades]);
  const grid = useMemo(() => buildMonthGrid(year, month, WEEK_START), [year, month]);
  const days = useMemo(() => Object.entries(byDate).map(([date, dayTrades]) => ({
    date,
    trades: dayTrades,
    ...dayStats(dayTrades),
  })), [byDate]);
  const summary = monthStats(days.filter((day) => day.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`)));
  const monthLabel = monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const selectedTrades = selectedDate ? byDate[selectedDate] || [] : [];
  const monthHasMatches = days.some((day) => day.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}-`));
  const weekTotals = Array.from({ length: 6 }, (_, week) => weeklyStats(
    grid.slice(week * 7, (week + 1) * 7).map((cell) => ({ trades: byDate[cell.date] || [] })),
  ));

  useEffect(() => {
    if (!focusedDate) return;
    dayButtonRefs.current.get(focusedDate)?.focus();
  }, [focusedDate, monthDate]);

  useEffect(() => {
    if (!selectedDate) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setSelectedDate("");
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedDate]);

  function changeMonth(offset) {
    const next = new Date(year, month + offset, 1);
    setMonthDate(next);
    setFocusedDate(localDateKey(next));
  }

  function handleDayKeyDown(event, date) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const nextDate = moveDate(date, offset);
    const next = dateFromKey(nextDate);
    if (next.getMonth() !== month || next.getFullYear() !== year) {
      setMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    setFocusedDate(nextDate);
  }

  function dayLabel(cell, stats) {
    const monthName = dateFromKey(cell.date).toLocaleString("en-US", { month: "short" });
    return `${monthName} ${cell.day}, ${stats.count} ${stats.count === 1 ? "trade" : "trades"}, net ${fullMoney(stats.netPnl)}`;
  }

  return (
    <section className="journal-calendar" aria-label="Trade journal calendar">
      <div className="journal-calendar-heading">
        <div className="journal-calendar-controls">
          <button type="button" onClick={() => {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            setMonthDate(first);
            setFocusedDate(today);
          }}>Today</button>
          <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>‹</button>
          <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>›</button>
        </div>
        <h2>{monthLabel}</h2>
        <strong className={`journal-calendar-net-pill ${summary.netPnl >= 0 ? "positive" : "negative"}`}>{fullMoney(summary.netPnl)}</strong>
      </div>

      <div className="journal-calendar-summary" aria-label={`${monthLabel} summary`}>
        <div><span>Net P&amp;L</span><strong className={summary.netPnl > 0 ? "pnl-positive" : summary.netPnl < 0 ? "pnl-negative" : ""}>{fullMoney(summary.netPnl)}</strong></div>
        <div><span>Trading days</span><strong>{summary.tradingDays}</strong></div>
        <div><span>Green / red days</span><strong><i className="journal-positive-text">{summary.greenDays}</i> / <i className="journal-negative-text">{summary.redDays}</i></strong></div>
        <div><span>Win-day rate</span><strong>{summary.winDayRate.toFixed(0)}%</strong></div>
        <div><span>Best day</span><strong>{summary.bestDay ? `${summary.bestDay.date.slice(-2)} · ${fullMoney(summary.bestDay.netPnl)}` : "—"}</strong></div>
        <div><span>Worst day</span><strong>{summary.worstDay ? `${summary.worstDay.date.slice(-2)} · ${fullMoney(summary.worstDay.netPnl)}` : "—"}</strong></div>
      </div>

      <div className="journal-calendar-legend" aria-label="Day result legend">
        <span><i className="legend-win" /> Win day</span>
        <span><i className="legend-loss" /> Loss day</span>
        <span><i className="legend-flat" /> Flat</span>
      </div>

      {!monthHasMatches && trades.length > 0 && (
        <p className="journal-calendar-empty-month" role="status">No matching trades in {monthLabel}. Try another month or adjust your filters.</p>
      )}

      <div className="journal-calendar-grid" role="grid" aria-label={monthLabel} aria-colcount="8">
        <div className="journal-calendar-week-row journal-calendar-weekday-row" role="row">
          {WEEKDAYS.map((weekday) => <div className="journal-calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
          <div className="journal-calendar-weekday journal-calendar-week-label" role="columnheader">Week</div>
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div className="journal-calendar-week-row" role="row" key={`week-${week}`}>
            {grid.slice(week * 7, (week + 1) * 7).map((cell) => {
          const stats = dayStats(byDate[cell.date] || []);
          const classes = [
            "journal-calendar-day",
            cell.inMonth ? "" : "out-of-month",
            cell.weekday === "Saturday" || cell.weekday === "Sunday" ? "weekend" : "",
            stats.count ? `status-${stats.status}` : "no-trades",
            cell.date === today ? "today" : "",
            cell.date === selectedDate ? "selected" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              role="gridcell"
              aria-label={dayLabel(cell, stats)}
              aria-selected={cell.date === selectedDate}
              aria-current={cell.date === today ? "date" : undefined}
              className={classes}
              key={cell.date}
              data-date={cell.date}
              ref={(element) => {
                if (element) dayButtonRefs.current.set(cell.date, element);
                else dayButtonRefs.current.delete(cell.date);
              }}
              onClick={() => {
                setSelectedDate(cell.date);
                setFocusedDate(cell.date);
              }}
              onKeyDown={(event) => handleDayKeyDown(event, cell.date)}
            >
              <span className="journal-calendar-day-number">{cell.day}</span>
              {stats.count > 0 && (
                <>
                  <strong className="journal-calendar-pnl">{compactMoney(stats.netPnl)}</strong>
                  <span className="journal-calendar-count">{stats.count} {stats.count === 1 ? "trade" : "trades"}</span>
                </>
              )}
              {stats.count > 0 && (
                <span className="journal-calendar-tags">
                  {[...new Set((byDate[cell.date] || []).map((trade) => trade.strategy || trade.asset).filter(Boolean))]
                    .slice(0, 2)
                    .map((tag) => <span className="journal-calendar-tag" key={tag}>{tag}</span>)}
                  {[...new Set((byDate[cell.date] || []).map((trade) => trade.strategy || trade.asset).filter(Boolean))].length > 2
                    && <span className="journal-calendar-tag-more">+{[...new Set((byDate[cell.date] || []).map((trade) => trade.strategy || trade.asset).filter(Boolean))].length - 2} more</span>}
                </span>
              )}
            </button>
          );
            })}
            <div className="journal-calendar-week-total" role="gridcell" aria-label={`Week ${week + 1}, ${weekTotals[week].count} trades, net ${fullMoney(weekTotals[week].netPnl)}`}>
              <span>Week {week + 1}</span>
              <strong className={weekTotals[week].netPnl > 0 ? "pnl-positive" : weekTotals[week].netPnl < 0 ? "pnl-negative" : ""}>{fullMoney(weekTotals[week].netPnl)}</strong>
              <small>{weekTotals[week].count} trades</small>
            </div>
          </div>
        ))}
      </div>
      {missingDateCount > 0 && (
        <p className="journal-calendar-missing" role="status">
          {missingDateCount} {missingDateCount === 1 ? "trade has" : "trades have"} no valid recorded date and {missingDateCount === 1 ? "is" : "are"} excluded from the calendar.
        </p>
      )}

      {selectedDate && (
        <div className="journal-day-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedDate("");
        }}>
          <aside className="journal-day-panel" role="dialog" aria-modal="true" aria-labelledby="journal-day-title">
            <header className="journal-day-panel-heading">
              <div>
                <p className="eyebrow">DAY REVIEW</p>
                <h2 id="journal-day-title">{readableDate(selectedDate)}</h2>
                <p>{selectedTrades.length} {selectedTrades.length === 1 ? "trade" : "trades"} · <strong className={dayStats(selectedTrades).netPnl > 0 ? "pnl-positive" : dayStats(selectedTrades).netPnl < 0 ? "pnl-negative" : ""}>{fullMoney(dayStats(selectedTrades).netPnl)}</strong></p>
              </div>
              <button type="button" aria-label="Close day panel" onClick={() => setSelectedDate("")}>×</button>
            </header>
            <div className="journal-day-panel-content">
              {selectedTrades.length ? selectedTrades.map((trade) => (
                <CalendarTradeRow
                  key={trade.id}
                  trade={trade}
                  onViewTrade={(selectedTrade) => {
                    setSelectedDate("");
                    onViewTrade(selectedTrade);
                  }}
                  onEditTrade={(selectedTrade) => {
                    setSelectedDate("");
                    onEditTrade(selectedTrade);
                  }}
                  onDeleteTrade={onDeleteTrade}
                />
              )) : (
                <div className="journal-day-empty">
                  <p>No trades on this day</p>
                  <button type="button" className="secondary-btn" onClick={() => {
                    const date = selectedDate;
                    setSelectedDate("");
                    onAddTrade(date);
                  }}>Add trade</button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export default JournalCalendar;
