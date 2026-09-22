const extractionFields = [
  "asset",
  "direction",
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "pnl",
  "date",
  "time",
  "timeframe",
  "positionSize",
  "riskReward",
  "strategy",
];

const numericExtractionFields = [
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "positionSize",
  "riskReward",
  "pnl",
];

const textExtractionFields = [
  "direction",
  "asset",
  "date",
  "time",
  "timeframe",
  "strategy",
];

const conditionFields = [
  "Liquidity Sweep",
  "MSS",
  "FVG",
  "Displacement",
  "Order Block",
  "Stochastic Confirmation",
];

export const extractionWarning = "AI-extracted data is a draft — verify all fields before saving.";
export const inconsistentExtractionWarning = "AI results were inconsistent across repeated checks — please verify every field carefully before saving.";

export function extractNumericValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const match = String(value).trim().match(/^[+-]?(?:\d[\d,]*\.?\d*|\.\d+)/);
  return match ? match[0].replace(/,/g, "") : "";
}

export function parseNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const normalized = typeof value === "number" ? String(value) : extractNumericValue(value);
  const parsed = normalized ? Number.parseFloat(normalized) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function numbersAgree(first: string, second: string): boolean {
  const firstNumber = parseNumber(first);
  const secondNumber = parseNumber(second);
  if (firstNumber === null || secondNumber === null) {
    return first.trim() === "" && second.trim() === "";
  }

  const absoluteDifference = Math.abs(firstNumber - secondNumber);
  const scale = Math.max(Math.abs(firstNumber), Math.abs(secondNumber));
  return absoluteDifference <= 0.01 || (scale > 0 && absoluteDifference / scale <= 0.005);
}

function textValuesAgree(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

export function mergeExtractions(
  firstExtraction: Record<string, string>,
  secondExtraction: Record<string, string>,
  firstConditionStates: Record<string, string>,
  secondConditionStates: Record<string, string>,
): {
  extraction: Record<string, string>;
  conditionStates: Record<string, string>;
  hasMismatch: boolean;
} {
  let hasMismatch = false;
  const extraction: Record<string, string> = {};

  numericExtractionFields.forEach((field) => {
    const first = firstExtraction[field];
    const second = secondExtraction[field];
    if (numbersAgree(first, second)) {
      extraction[field] = first;
    } else {
      extraction[field] = "";
      hasMismatch = true;
    }
  });

  textExtractionFields.forEach((field) => {
    const first = firstExtraction[field];
    const second = secondExtraction[field];
    if (textValuesAgree(first, second)) {
      extraction[field] = first;
    } else {
      extraction[field] = "";
      hasMismatch = true;
    }
  });

  const conditionStates: Record<string, string> = {};
  conditionFields.forEach((field) => {
    if (firstConditionStates[field] === secondConditionStates[field]) {
      conditionStates[field] = firstConditionStates[field];
    } else {
      conditionStates[field] = "NOT DETECTED";
      hasMismatch = true;
    }
  });

  return { extraction, conditionStates, hasMismatch };
}

export function getExtractionWarning(hasMismatch: boolean): string {
  return hasMismatch ? inconsistentExtractionWarning : extractionWarning;
}

export function deriveDirection(stopLoss: number | null, takeProfit: number | null): string | null {
  if (stopLoss === null || takeProfit === null) {
    return null;
  }

  if (stopLoss > takeProfit) {
    return "Short";
  }

  if (stopLoss < takeProfit) {
    return "Long";
  }

  return null;
}

export function deriveExit(
  currentPrice: number | null,
  stopLoss: number | null,
  takeProfit: number | null,
  modelExit: string,
): string {
  if (currentPrice === null || stopLoss === null || takeProfit === null) {
    return modelExit;
  }

  return String(Math.abs(currentPrice - stopLoss) <= Math.abs(currentPrice - takeProfit)
    ? stopLoss
    : takeProfit);
}

export function calculatePnl(
  entry: number | null,
  exit: number | null,
  positionSize: number | null,
  direction: string | null,
): string | null {
  if (entry === null || exit === null || positionSize === null || !direction) {
    return null;
  }

  const normalizedDirection = direction.trim().toLowerCase();
  if (normalizedDirection !== "short" && normalizedDirection !== "sell" && normalizedDirection !== "long" && normalizedDirection !== "buy") {
    return null;
  }

  const pnl = normalizedDirection === "short"
    ? (entry - exit) * positionSize
    : (exit - entry) * positionSize;
  return `${pnl} (calculated)`;
}

export function calculateRiskReward(
  entry: number | null,
  stopLoss: number | null,
  takeProfit: number | null,
  direction: string | null,
): string | null {
  if (entry === null || stopLoss === null || takeProfit === null || !direction) {
    return null;
  }

  const normalizedDirection = direction.trim().toLowerCase();
  const risk = normalizedDirection === "short" || normalizedDirection === "sell"
    ? stopLoss - entry
    : normalizedDirection === "long" || normalizedDirection === "buy"
      ? entry - stopLoss
      : 0;
  const reward = normalizedDirection === "short" || normalizedDirection === "sell"
    ? entry - takeProfit
    : normalizedDirection === "long" || normalizedDirection === "buy"
      ? takeProfit - entry
      : 0;

  if (risk <= 0 || reward < 0) {
    return null;
  }

  return `${(reward / risk).toFixed(1)} (calculated)`;
}

export function validateAndCalculateLevels(extraction: Record<string, string>): Record<string, string> {
  const nextExtraction = { ...extraction };
  const entryText = extraction.entry.trim();
  const entry = parseNumber(entryText);
  const stopLoss = parseNumber(extraction.stopLoss);
  const takeProfit = parseNumber(extraction.takeProfit);
  const derivedDirection = deriveDirection(stopLoss, takeProfit);
  const modelDirection = extraction.direction.trim();
  if (derivedDirection !== null) {
    nextExtraction.direction = derivedDirection;
  }

  const riskRewardText = extraction.riskReward.trim();
  const riskReward = parseNumber(riskRewardText);
  const calculationDirection = (derivedDirection || modelDirection).toLowerCase();
  const isLong = calculationDirection === "long" || calculationDirection === "buy";
  const isShort = calculationDirection === "short" || calculationDirection === "sell";
  const decimalPoint = entryText.indexOf(".");
  const decimalPlaces = decimalPoint === -1 ? 0 : entryText.length - decimalPoint - 1;
  const formatPrice = (value: number) => value.toFixed(decimalPlaces);
  const hasStopLoss = extraction.stopLoss.trim() !== "";
  const hasTakeProfit = extraction.takeProfit.trim() !== "";

  if (entry !== null && riskReward !== null && riskReward > 0 && (isLong || isShort)) {
    if (hasStopLoss !== hasTakeProfit) {
      if (hasStopLoss && stopLoss !== null) {
        nextExtraction.takeProfit = formatPrice(isLong
          ? entry + (entry - stopLoss) * riskReward
          : entry - (stopLoss - entry) * riskReward) + " (calculated)";
      } else if (hasTakeProfit && takeProfit !== null) {
        nextExtraction.stopLoss = formatPrice(isLong
          ? entry - (takeProfit - entry) / riskReward
          : entry + (entry - takeProfit) / riskReward) + " (calculated)";
      }
    } else if (hasStopLoss && hasTakeProfit && stopLoss !== null && takeProfit !== null) {
      const risk = isLong ? entry - stopLoss : stopLoss - entry;
      const reward = isLong ? takeProfit - entry : entry - takeProfit;
      if (risk > 0 && reward >= 0) {
        const calculatedRiskReward = reward / risk;
        const relativeDifference = Math.abs(calculatedRiskReward - riskReward) / riskReward;
        if (relativeDifference > 0.15) {
          const inconsistencyWarning = " (inconsistent with detected R:R — verify manually)";
          nextExtraction.stopLoss = `${extraction.stopLoss}${inconsistencyWarning}`;
          nextExtraction.takeProfit = `${extraction.takeProfit}${inconsistencyWarning}`;
        }
      }
    }
  }

  return nextExtraction;
}

export function processExtraction(
  extraction: Record<string, string>,
  currentPriceText: string,
): Record<string, string> {
  const validatedExtraction = validateAndCalculateLevels(extraction);
  const currentPrice = parseNumber(currentPriceText);
  const entry = parseNumber(validatedExtraction.entry);
  const stopLoss = parseNumber(validatedExtraction.stopLoss);
  const takeProfit = parseNumber(validatedExtraction.takeProfit);
  const exit = deriveExit(currentPrice, stopLoss, takeProfit, validatedExtraction.exit);
  const nextExtraction = { ...validatedExtraction, exit };
  const positionSize = parseNumber(validatedExtraction.positionSize);
  const calculatedRiskReward = calculateRiskReward(entry, stopLoss, takeProfit, validatedExtraction.direction);
  if (!validatedExtraction.riskReward.trim() && calculatedRiskReward !== null) {
    nextExtraction.riskReward = calculatedRiskReward;
  }
  const calculatedPnl = calculatePnl(entry, parseNumber(exit), positionSize, validatedExtraction.direction);

  if (!validatedExtraction.pnl.trim() && calculatedPnl !== null) {
    nextExtraction.pnl = calculatedPnl;
  }

  return nextExtraction;
}

export function isValidExtraction(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === extractionFields.length && extractionFields.every(
    (field) => keys.includes(field) && typeof record[field] === "string",
  );
}
