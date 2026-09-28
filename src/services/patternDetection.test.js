import { detectFVGs, detectLiquiditySweeps } from "./patternDetection";

function bar(open, high, low, close, timestamp = 0) {
  return { timestamp, open, high, low, close, volume: 100 };
}

describe("pattern detection", () => {
  it("returns the exact bullish and bearish FVG zones between surrounding bars", () => {
    const bars = [
      bar(10, 12, 9, 11),
      bar(13, 15, 12, 14),
      bar(14, 16, 13, 15),
      bar(17, 19, 16, 18),
      bar(11, 12, 10, 11),
      bar(11, 13, 9, 12),
    ];

    expect(detectFVGs(bars)).toEqual([
      { index: 1, confirmedAt: 2, type: "bullish", top: 13, bottom: 12 },
      { index: 2, confirmedAt: 3, type: "bullish", top: 16, bottom: 15 },
      { index: 3, confirmedAt: 4, type: "bearish", top: 13, bottom: 12 },
      { index: 4, confirmedAt: 5, type: "bearish", top: 16, bottom: 13 },
    ]);
  });

  it("requires a strict gap and returns no FVG when neighboring ranges touch", () => {
    const bars = [bar(10, 12, 9, 11), bar(12, 14, 11, 13), bar(13, 15, 12, 14)];

    expect(detectFVGs(bars)).toEqual([]);
    expect(detectFVGs([])).toEqual([]);
  });

  it("detects same-bar high and low reversals against the preceding lookback range", () => {
    const bars = [
      bar(10, 12, 8, 10),
      bar(10, 11, 9, 10),
      bar(10, 13, 7, 10),
    ];

    expect(detectLiquiditySweeps(bars, 2)).toEqual([
      { index: 2, confirmedAt: 2, type: "high", sweptLevel: 12, reversed: true },
      { index: 2, confirmedAt: 2, type: "low", sweptLevel: 8, reversed: true },
    ]);
  });

  it("confirms a sweep when the next bar closes back inside and ignores a genuine breakout", () => {
    const bars = [
      bar(10, 12, 9, 11),
      bar(11, 11, 10, 10),
      bar(12, 13, 10, 12.5),
      bar(12.5, 12.8, 10.5, 11.5),
      bar(11.5, 14, 11, 13.5),
      bar(13.5, 14.5, 12, 14),
    ];

    expect(detectLiquiditySweeps(bars, 2)).toEqual([
      { index: 2, confirmedAt: 3, type: "high", sweptLevel: 12, reversed: true },
    ]);
  });

  it("rejects non-positive or non-integer lookback values", () => {
    expect(() => detectLiquiditySweeps([bar(1, 2, 0, 1)], 0)).toThrow("lookback must be a positive integer");
    expect(() => detectLiquiditySweeps([bar(1, 2, 0, 1)], 1.5)).toThrow("lookback must be a positive integer");
  });
});