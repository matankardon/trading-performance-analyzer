export type CoachSummary = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  focusNext: string[];
};

export type CoachSummaryResult =
  | { ok: true; result: CoachSummary }
  | { ok: false; error: "INVALID_JSON" | "INVALID_SCHEMA" | "NO_GROUNDED_CONTENT" };

const MAX_SUMMARY_LENGTH = 700;
const MAX_ITEM_LENGTH = 280;
const MAX_LIST_ITEMS = 3;
const numericPattern = /[-+]?\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const metricCitationPattern = /\b(expectancy|win rate|profit factor|net p&l|p&l|avg(?:erage)? r\s*:?\s*r|risk.reward|trade(?:s)?|sample|session|weekday|condition|indicator|rule break|combo|drawdown|version)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function parseContent(content: string): unknown | null {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function collectInputNumbers(value: unknown, result: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    result.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectInputNumbers(item, result));
  } else if (isRecord(value)) {
    Object.values(value).forEach((item) => collectInputNumbers(item, result));
  }
  return result;
}

function parseOutputNumbers(value: string): number[] {
  return [...value.matchAll(numericPattern)]
    .map(([token]) => Number(token.replace(/[$,]/g, "")))
    .filter(Number.isFinite);
}

function numbersAreGrounded(value: string, inputNumbers: number[]): boolean {
  return parseOutputNumbers(value).every((outputNumber) => inputNumbers.some((inputNumber) => {
    const difference = Math.abs(outputNumber - inputNumber);
    const scale = Math.max(Math.abs(outputNumber), Math.abs(inputNumber));
    return difference <= 0.01 || (scale > 0 && difference / scale <= 0.005);
  }));
}

function cleanItem(value: unknown, maxLength: number, inputNumbers: number[]): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, maxLength);
  if (!text || !metricCitationPattern.test(text) || !numbersAreGrounded(text, inputNumbers)) return null;
  return text;
}

function cleanList(value: unknown, inputNumbers: number[]): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value
    .map((item) => cleanItem(item, MAX_ITEM_LENGTH, inputNumbers))
    .filter((item): item is string => item !== null)
    .slice(0, MAX_LIST_ITEMS);
}

export function processCoachSummary(content: string, analysis: unknown): CoachSummaryResult {
  const parsed = parseContent(content);
  if (!isRecord(parsed)) return { ok: false, error: "INVALID_JSON" };
  if (!hasExactKeys(parsed, ["summary", "strengths", "weaknesses", "focusNext"])) {
    return { ok: false, error: "INVALID_SCHEMA" };
  }

  const inputNumbers = collectInputNumbers(analysis);
  const summary = cleanItem(parsed.summary, MAX_SUMMARY_LENGTH, inputNumbers);
  const strengths = cleanList(parsed.strengths, inputNumbers);
  const weaknesses = cleanList(parsed.weaknesses, inputNumbers);
  const focusNext = cleanList(parsed.focusNext, inputNumbers);
  if (strengths === null || weaknesses === null || focusNext === null) {
    return { ok: false, error: "INVALID_SCHEMA" };
  }
  if (!summary) return { ok: false, error: "NO_GROUNDED_CONTENT" };

  return {
    ok: true,
    result: { summary, strengths, weaknesses, focusNext },
  };
}