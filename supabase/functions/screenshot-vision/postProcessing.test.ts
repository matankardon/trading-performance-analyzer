import {
  calculatePnl,
  calculateRiskReward,
  deriveDirection,
  deriveExit,
  extractNumericValue,
  getExtractionWarning,
  isValidExtraction,
  mergeExtractions,
  parseNumber,
  validateAndCalculateLevels,
} from "./postProcessing";

const extraction = {
  asset: "CFDs on Gold (US$ / OZ)",
  direction: "Short",
  entry: "4386.502",
  exit: "4373.168",
  stopLoss: "4391.919",
  takeProfit: "4373.168",
  pnl: "133.34",
  date: "Wed 02 Sep '26",
  time: "15:35",
  timeframe: "",
  positionSize: "10",
  riskReward: "2.5",
  strategy: "",
};

const conditionStates = {
  "Liquidity Sweep": "NOT DETECTED",
  MSS: "NOT DETECTED",
  FVG: "NOT DETECTED",
  Displacement: "NOT DETECTED",
  "Order Block": "NOT DETECTED",
  "Stochastic Confirmation": "NOT DETECTED",
};

describe("screenshot vision post-processing", () => {
  it("merges identical extractions without a mismatch warning", () => {
    const result = mergeExtractions(extraction, { ...extraction }, conditionStates, { ...conditionStates });

    expect(result.extraction).toEqual(extraction);
    expect(result.conditionStates).toEqual(conditionStates);
    expect(result.hasMismatch).toBe(false);
    expect(getExtractionWarning(result.hasMismatch)).toContain("draft");
  });

  it("blanks numeric fields that disagree beyond the tolerance", () => {
    const result = mergeExtractions(extraction, { ...extraction, entry: "4500" }, conditionStates, { ...conditionStates });

    expect(result.extraction.entry).toBe("");
    expect(result.hasMismatch).toBe(true);
  });

  it("blanks text fields that disagree", () => {
    const result = mergeExtractions(extraction, { ...extraction, direction: "Long" }, conditionStates, { ...conditionStates });

    expect(result.extraction.direction).toBe("");
    expect(result.hasMismatch).toBe(true);
  });

  it("defaults mismatched condition states to NOT DETECTED", () => {
    const result = mergeExtractions(extraction, { ...extraction }, conditionStates, {
      ...conditionStates,
      MSS: "CONFIDENT",
    });

    expect(result.conditionStates.MSS).toBe("NOT DETECTED");
    expect(result.hasMismatch).toBe(true);
    expect(getExtractionWarning(result.hasMismatch)).toContain("inconsistent");
  });

  it("derives direction from stop loss and take profit order", () => {
    expect(deriveDirection(4391.919, 4373.168)).toBe("Short");
    expect(deriveDirection(4373.168, 4391.919)).toBe("Long");
    expect(deriveDirection(null, 4373.168)).toBeNull();
    expect(deriveDirection(4391.919, null)).toBeNull();
  });

  it("derives the closest hit level as exit and preserves a missing-input model value", () => {
    expect(deriveExit(4373.168, 4391.919, 4373.168, "")).toBe("4373.168");
    expect(deriveExit(null, 4391.919, 4373.168, "")).toBe("");
    expect(deriveExit(null, null, null, "4380.000")).toBe("4380.000");
  });

  it("calculates short P&L only when position size is known", () => {
    expect(calculatePnl(4386.502, 4373.168, 10, "Short")).toMatch(/^133\.34/);
    expect(calculatePnl(4386.502, 4373.168, null, "Short")).toBeNull();
  });

  it("parses comma-formatted levels and preserves model direction when levels are missing", () => {
    expect(extractNumericValue("4326.290 (calculated)")).toBe("4326.290");
    expect(extractNumericValue("1.2000 (inconsistent with detected R:R — verify manually)")).toBe("1.2000");
    expect(extractNumericValue("133.34")).toBe("133.34");
    expect(parseNumber("4,386.502")).toBe(4386.502);
    expect(parseNumber("4,391.919 (calculated)")).toBe(4391.919);
    const extraction = {
      asset: "",
      direction: "Long",
      entry: "4,386.502",
      exit: "",
      stopLoss: "",
      takeProfit: "",
      pnl: "",
      date: "",
      time: "",
      timeframe: "",
      positionSize: "",
      riskReward: "",
      strategy: "",
    };

    expect(validateAndCalculateLevels(extraction).direction).toBe("Long");
  });

  it("calculates missing risk/reward from comma-formatted levels", () => {
    expect(calculateRiskReward(4386.502, 4391.919, 4373.168, "Short")).toBe("2.5 (calculated)");
  });

  it("accepts an all-empty extraction as valid", () => {
    const emptyExtraction = {
      asset: "",
      direction: "",
      entry: "",
      exit: "",
      stopLoss: "",
      takeProfit: "",
      pnl: "",
      date: "",
      time: "",
      timeframe: "",
      positionSize: "",
      riskReward: "",
      strategy: "",
    };

    expect(isValidExtraction(emptyExtraction)).toBe(true);
  });
});
