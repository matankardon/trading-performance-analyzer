export const WEEK_START = 0;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isValidDateKey(value) {
  const match = typeof value === "string" ? DATE_PATTERN.exec(value) : null;
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function finitePnl(trade) {
  const value = Number(trade?.pnl ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function groupTradesByDay(trades = []) {
  const byDate = {};
  let missingDateCount = 0;
  trades.forEach((trade) => {
    const date = trade?.date;
    if (!isValidDateKey(date)) {
      missingDateCount += 1;
      return;
    }
    (byDate[date] ||= []).push(trade);
  });
  return { byDate, missingDateCount };
}

export function dayStats(trades = []) {
  const rawNetPnl = trades.reduce((sum, trade) => sum + finitePnl(trade), 0);
  const netPnl = Number.isFinite(rawNetPnl) ? rawNetPnl : 0;
  const wins = trades.filter((trade) => finitePnl(trade) > 0).length;
  const losses = trades.filter((trade) => finitePnl(trade) < 0).length;
  return {
    count: trades.length,
    netPnl,
    wins,
    losses,
    status: netPnl > 0 ? "win" : netPnl < 0 ? "loss" : "flat",
  };
}

export function monthStats(days = []) {
  const tradingDays = days
    .filter((day) => Number(day?.count) > 0)
    .map((day) => ({
      ...day,
      count: Number(day.count),
      netPnl: Number.isFinite(Number(day.netPnl)) ? Number(day.netPnl) : 0,
    }));
  const greenDays = tradingDays.filter((day) => day.netPnl > 0).length;
  const redDays = tradingDays.filter((day) => day.netPnl < 0).length;
  const netPnl = tradingDays.reduce((sum, day) => sum + day.netPnl, 0);
  const sorted = [...tradingDays].sort((left, right) => left.netPnl - right.netPnl);
  return {
    netPnl: Number.isFinite(netPnl) ? netPnl : 0,
    tradingDays: tradingDays.length,
    greenDays,
    redDays,
    winDayRate: tradingDays.length ? (greenDays / tradingDays.length) * 100 : 0,
    bestDay: sorted.at(-1) || null,
    worstDay: sorted[0] || null,
  };
}

export function weeklyStats(days = []) {
  const stats = days.map((day) => (Array.isArray(day?.trades) ? dayStats(day.trades) : {
    count: Number(day?.count) || 0,
    netPnl: Number.isFinite(Number(day?.netPnl)) ? Number(day.netPnl) : 0,
  }));
  const netPnl = stats.reduce((sum, day) => sum + day.netPnl, 0);
  return {
    netPnl: Number.isFinite(netPnl) ? netPnl : 0,
    count: stats.reduce((sum, day) => sum + day.count, 0),
  };
}

function dateKey(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildMonthGrid(year, month, weekStart = WEEK_START) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11
    || !Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) {
    throw new RangeError("Year, month, or week start is out of range.");
  }
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() - weekStart + 7) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      date: dateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
      weekday: WEEKDAY_NAMES[date.getDay()],
    };
  });
}
