import { INDICATORS, SETUP_CONDITIONS } from "../../../src/constants/strategyOptions.js";

export const ALLOWED_SESSIONS = ["New York", "London", "Asia", "Overlap"] as const;

export type DraftTradeAllowLists = {
  sessions: string[];
  conditions: string[];
  indicators: string[];
  strategies: Array<{ name: string; versions: number[] }>;
};

export type DraftTrade = {
  asset: string | null;
  direction: "Long" | "Short" | null;
  entry: number | null;
  exit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  date: string | null;
  session: string | null;
  strategyName: string | null;
  versionNumber: number | null;
  conditions: string[];
  indicators: string[];
};

function isSafeText(value: string): boolean {
  const pathMatch = /(?<![\w])(?:[A-Za-z]:)?\/?[\w.-]+(?:[\\/][\w.-]+)+(?![\w])/i.exec(value);
  return !/https?:\/\/|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|[\u0000-\u001f\u007f]/i.test(value)
    && (!pathMatch || /^[A-Z]{3}\/[A-Z]{3}$/.test(pathMatch[0]));
}

function mentioned(message: string, text: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu").test(message);
}

function stringIfStated(value: unknown, message: string, maxLength = 100): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    && isSafeText(value)
    && mentioned(message, value.trim())
    ? value.trim()
    : null;
}

function labeledNumber(message: string, labels: string): number | null {
  const match = new RegExp(`(?:${labels})\\s*(?:at|of|is|:|=)?\\s*[$]?\\s*([+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)?(?:\\.\\d+)?|\\.\\d+)`, "i").exec(message);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function numberIfStated(value: unknown, message: string, labels: string): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const stated = labeledNumber(message, labels);
  return stated !== null && stated === value ? value : null;
}

function dateIfStated(value: unknown, message: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !mentioned(message, value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

function directionIfStated(value: unknown, message: string): "Long" | "Short" | null {
  if (typeof value !== "string") return null;
  const direction = value.toLowerCase();
  if ((direction === "long" && (mentioned(message, "long") || mentioned(message, "buy")))
    || (direction === "short" && (mentioned(message, "short") || mentioned(message, "sell")))) {
    return direction === "long" ? "Long" : "Short";
  }
  return null;
}

const conditionAliases: Record<string, string[]> = {
  "Liquidity Sweep": ["liquidity sweep", "sweep"],
  MSS: ["mss", "market structure shift"],
  FVG: ["fvg", "fair value gap"],
  Displacement: ["displacement"],
  "Order Block": ["order block"],
  "Stochastic Confirmation": ["stochastic", "stochastic confirmation"],
};

function allowedMentionedItems(value: unknown, allowed: string[], message: string, kind: "condition" | "indicator"): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => {
    if (typeof item !== "string" || !allowed.includes(item)) return false;
    const aliases = kind === "condition"
      ? conditionAliases[item] || [item]
      : [item];
    return aliases.some((alias) => mentioned(message, alias));
  }))];
}

export function postProcessTradeDraft(
  value: unknown,
  message: string,
  allowLists: DraftTradeAllowLists,
): DraftTrade {
  const source = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const asset = stringIfStated(source.asset, message);
  const sessionValue = stringIfStated(source.session, message);
  const strategyNameValue = stringIfStated(source.strategyName, message);
  const versionNumberValue = typeof source.versionNumber === "number" && Number.isInteger(source.versionNumber)
    ? source.versionNumber
    : null;
  const strategy = allowLists.strategies.find((candidate) => candidate.name === strategyNameValue);
  const versionNumber = strategy
    && versionNumberValue !== null
    && strategy.versions.includes(versionNumberValue)
    && new RegExp(`\\b(?:v|version\\s*)${versionNumberValue}\\b`, "i").test(message)
    ? versionNumberValue
    : null;
  const date = dateIfStated(source.date, message);

  return {
    asset,
    direction: directionIfStated(source.direction, message),
    entry: numberIfStated(source.entry, message, "\\bentry\\b"),
    exit: numberIfStated(source.exit, message, "\\bexit\\b"),
    stopLoss: numberIfStated(source.stopLoss, message, "\\b(?:stop\\s*loss|stop|sl)\\b"),
    takeProfit: numberIfStated(source.takeProfit, message, "\\b(?:take\\s*profit|target|tp)\\b"),
    pnl: numberIfStated(source.pnl, message, "\\b(?:p\\s*&\\s*l|pnl)\\b"),
    date,
    session: sessionValue && allowLists.sessions.includes(sessionValue) ? sessionValue : null,
    strategyName: strategy ? strategy.name : null,
    versionNumber,
    conditions: allowedMentionedItems(source.conditions, allowLists.conditions, message, "condition"),
    indicators: allowedMentionedItems(source.indicators, allowLists.indicators, message, "indicator"),
  };
}

export function isValidDraftAllowLists(value: unknown): value is DraftTradeAllowLists {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const lists = value as Record<string, unknown>;
  return Object.keys(lists).length === 4
    && Array.isArray(lists.sessions) && lists.sessions.every((item) => ALLOWED_SESSIONS.includes(item))
    && Array.isArray(lists.conditions) && lists.conditions.every((item) => SETUP_CONDITIONS.some(({ label }) => label === item))
    && Array.isArray(lists.indicators) && lists.indicators.every((item) => INDICATORS.some(({ name }) => name === item))
    && Array.isArray(lists.strategies) && lists.strategies.length <= 100
    && lists.strategies.every((strategy) => {
      if (typeof strategy !== "object" || strategy === null || Array.isArray(strategy)) return false;
      const entry = strategy as Record<string, unknown>;
      return Object.keys(entry).length === 2
        && typeof entry.name === "string" && entry.name.length > 0 && entry.name.length <= 100 && isSafeText(entry.name)
        && Array.isArray(entry.versions) && entry.versions.length <= 100
        && entry.versions.every((version) => Number.isInteger(version) && version > 0);
    });
}
