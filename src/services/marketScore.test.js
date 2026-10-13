import { describe, expect, it } from "vitest";
import {
  BAND_THRESHOLDS,
  computeMarketScore,
  getMarketScoreBand,
  keyLevels,
  MIN_BARS,
  WEIGHTS,
} from "./marketScore";

const MINUTE = 60_000;
const BASE_TIME = Date.UTC(2025, 0, 1);

function barsFromCloses(closes, { volume = 100, range = 0.2, start = BASE_TIME } = {}) {
  return closes.map((close, index) => ({
    timestamp: start + index * MINUTE,
    open: close,
    high: close + range,
    low: close - range,
    close,
    volume: typeof volume === "function" ? volume(index) : volume,
  }));
}

function makeFixtures() {
  const uptrend = barsFromCloses(Array.from(
    { length: 300 },
    (_, index) => 100 + index * 0.15 + Math.sin(index * Math.PI / 2 + Math.PI) * 0.5,
  ));
  const sideways = barsFromCloses(Array.from(
    { length: 300 },
    (_, index) => 100 + (index % 8 < 4 ? 0.2 : -0.2),
  ));
  const volatilitySpike = barsFromCloses(Array.from({ length: 300 }, (_, index) => (
    100 + index * 0.02 + (index >= 290 && index % 2 === 0 ? 4 : 0)
  )), { range: 0.2 });
  const zeroVolume = barsFromCloses(
    Array.from({ length: 300 }, (_, index) => 100 + index * 0.15 + Math.sin(index * Math.PI / 2 + Math.PI) * 0.5),
    { volume: 0 },
  );
  const short = barsFromCloses(Array.from({ length: 100 }, (_, index) => 100 + index * 0.1));
  const flat = barsFromCloses(Array.from({ length: 300 }, () => 100), { range: 0 });
  return { uptrend, sideways, volatilitySpike, zeroVolume, short, flat };
}

const fixtures = makeFixtures();

function expectNoNonFiniteNumbers(value) {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach(expectNoNonFiniteNumbers);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(expectNoNonFiniteNumbers);
  }
}

describe("market score engine", () => {
  it("scores a steady uptrend with aligned bullish conditions", () => {
    const result = computeMarketScore(fixtures.uptrend, { timeframe: "15m" });
    const trend = result.components.find(({ key }) => key === "trend");

    expect(trend.score).toBeGreaterThanOrEqual(90);
    expect(result.bias).toBe("Bullish");
    // 90.54*25 + 90*25 + 85.29*20 + 71.8*20 + 100*10 = 8655.3;
    // dividing by the 100 available weight points gives 86.55.
    expect(result.score).toBe(86.55);
    expect(result.band).toBe("Favorable");
  });

  it("keeps choppy structure low and directional bias mixed", () => {
    const result = computeMarketScore(fixtures.sideways);

    expect(result.components.find(({ key }) => key === "structure").score).toBeLessThan(55);
    expect(result.bias).toBe("Mixed");
  });

  it("renormalizes the exact score when zero volume is unavailable", () => {
    const result = computeMarketScore(fixtures.zeroVolume);
    const volume = result.components.find(({ key }) => key === "volume");

    expect(volume.available).toBe(false);
    expect(result.available).toBe(true);
    // With volume excluded, (90.54*25 + 90*25 + 85.29*20 + 71.8*20) / 90
    // is 85.06 after rounding.
    expect(result.score).toBe(85.06);
  });

  it("marks histories below MIN_BARS unavailable", () => {
    expect(MIN_BARS).toBe(200);
    const result = computeMarketScore(fixtures.short);

    expect(result.available).toBe(false);
    expect(result.reasons[0]).toContain("Not enough history");
  });

  it("uses the requested score-band boundaries", () => {
    expect(BAND_THRESHOLDS).toEqual({ favorable: 70, mixed: 45 });
    expect([44, 45, 69, 70].map(getMarketScoreBand)).toEqual([
      "Unfavorable",
      "Mixed",
      "Mixed",
      "Favorable",
    ]);
  });

  it("weights components to 100 and identifies tick volume", () => {
    expect(Object.values(WEIGHTS).reduce((total, weight) => total + weight, 0)).toBe(100);
    const result = computeMarketScore(fixtures.uptrend, { volumeKind: "tick" });

    expect(result.components.find(({ key }) => key === "volume").value).toContain("tick volume");
  });

  it("returns only finite numeric values for all deterministic fixtures", () => {
    Object.values(fixtures).forEach((bars) => {
      expectNoNonFiniteNumbers(computeMarketScore(bars));
      expectNoNonFiniteNumbers(keyLevels(bars));
    });
    const gappedBars = fixtures.uptrend.map((bar, index) => (
      index >= 150 ? { ...bar, timestamp: bar.timestamp + 5 * 24 * 60 * MINUTE } : bar
    ));
    expectNoNonFiniteNumbers(computeMarketScore(gappedBars));
    expectNoNonFiniteNumbers(keyLevels(gappedBars));
    expect(keyLevels([])).toMatchObject({
      previousDayHigh: null,
      previousDayLow: null,
      currentDayOpen: null,
      currentDayHigh: null,
      currentDayLow: null,
      atr14: null,
      dayBoundary: "UTC",
    });
  });

  it("returns key levels for the latest two UTC days", () => {
    const bars = [
      { timestamp: Date.UTC(2025, 0, 1, 23), open: 10, high: 12, low: 9, close: 11, volume: 1 },
      { timestamp: Date.UTC(2025, 0, 1, 23, 30), open: 11, high: 13, low: 10, close: 12, volume: 1 },
      { timestamp: Date.UTC(2025, 0, 2, 0), open: 12, high: 14, low: 11, close: 13, volume: 1 },
      { timestamp: Date.UTC(2025, 0, 2, 0, 30), open: 13, high: 15, low: 8, close: 14, volume: 1 },
      { timestamp: Date.UTC(2025, 0, 2, 1), open: 14, high: 16, low: 12, close: 15, volume: 1 },
    ];

    expect(keyLevels(bars)).toMatchObject({
      previousDayHigh: 13,
      previousDayLow: 9,
      previousDayClose: 12,
      currentDayOpen: 12,
      currentDayHigh: 16,
      currentDayLow: 8,
      latestSwingHigh: null,
      latestSwingLow: null,
      atr14: null,
      dayBoundary: "UTC",
    });
  });

  it("keeps flat series and zero-volume inputs finite", () => {
    const flatResult = computeMarketScore(fixtures.flat);
    const zeroVolumeResult = computeMarketScore(fixtures.zeroVolume);

    expect(flatResult.available).toBe(true);
    expect(zeroVolumeResult.components.find(({ key }) => key === "volume").value).toBe("Unavailable");
    expectNoNonFiniteNumbers(flatResult);
    expectNoNonFiniteNumbers(zeroVolumeResult);
  });
});
