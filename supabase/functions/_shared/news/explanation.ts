import { validateNewsExplanation } from "./requestValidation.ts";
import type { NewsExplanation } from "./types.ts";

const BANNED_PHRASES = [
  /\bguaranteed(?:\s+(?:profit|return|gain|success))?\b/i,
  /\brisk[\s-]?free\b/i,
  /\bwill\s+(?:rise|fall|surge|crash)\b/i,
  /\b(?:buy|sell)\s+now\b/i,
  /\bmust\s+(?:buy|sell)\b/i,
  /\bcertain\s+to\b/i,
  /\bno\s+risk\b/i,
  /\bprice\s+target\b/i,
];

function unwrapCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function collectStrings(value: NewsExplanation): string[] {
  return [
    value.whatHappened,
    value.whyItMatters,
    ...value.affects.flatMap(({ market, effect, reasoning }) => [market, effect, reasoning]),
    ...value.watchNext,
    value.caveat,
  ];
}

function numberTokens(value: string): Set<string> {
  return new Set((value.match(/(?<![A-Za-z])\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [])
    .map((token) => token.replace(/[$,%]/g, "").replace(/,/g, "")));
}

export function postProcessNewsExplanation(
  raw: unknown,
  title: string,
  summary: string | null,
): NewsExplanation | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapCodeFence(raw));
  } catch {
    return null;
  }
  const validated = validateNewsExplanation(parsed);
  if (!validated) return null;

  const explanationText = collectStrings(validated).join("\n");
  if (BANNED_PHRASES.some((phrase) => phrase.test(explanationText))) return null;

  const sourceNumbers = numberTokens(`${title} ${summary ?? ""}`);
  const unsupportedNumber = [...numberTokens(explanationText)].some((token) => !sourceNumbers.has(token));
  return unsupportedNumber ? null : validated;
}

export function getCachedNewsExplanation(value: unknown): NewsExplanation | null {
  return validateNewsExplanation(value);
}
