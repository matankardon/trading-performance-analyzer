import { detectMSS, detectOrderBlocks, detectSwingPoints } from "./structureDetection";

function bar(open, high, low, close, timestamp = 0) {
  return { timestamp, open, high, low, close, volume: 100 };
}

const bearishShiftBars = [
  bar(11, 12, 10, 11),
  bar(12, 14, 11, 13),
  bar(11, 12, 9, 10),
  bar(12, 13, 10, 12),
  bar(10, 11, 8, 9),
  bar(11, 12, 9, 11),
  bar(9, 10, 7, 8),
  bar(9, 9.5, 8, 8.5),
  bar(8.5, 14, 8.5, 13),
];

describe("market structure detection", () => {
  it("finds strict one-bar swing highs and lows at their exact indices", () => {
    expect(detectSwingPoints(bearishShiftBars, 1)).toEqual([
      { index: 1, type: "high", price: 14 },
      { index: 2, type: "low", price: 9 },
      { index: 3, type: "high", price: 13 },
      { index: 4, type: "low", price: 8 },
      { index: 5, type: "high", price: 12 },
      { index: 6, type: "low", price: 7 },
    ]);
  });

  it("uses two lower highs and lows to confirm bullish MSS above the latest swing high", () => {
    const swingPoints = detectSwingPoints(bearishShiftBars, 1);

    expect(detectMSS(bearishShiftBars, swingPoints)).toEqual([
      { index: 8, type: "bullish", brokenLevel: 12 },
    ]);
  });

  it("finds the last bearish candle before a bullish MSS as its order block", () => {
    const swingPoints = detectSwingPoints(bearishShiftBars, 1);
    const mssEvents = detectMSS(bearishShiftBars, swingPoints);

    expect(detectOrderBlocks(bearishShiftBars, mssEvents)).toEqual([
      { index: 7, type: "bullish", top: 9.5, bottom: 8 },
    ]);
  });

  it("detects bearish MSS after higher highs and lows and associates the last bullish candle", () => {
    const bullishShiftBars = bearishShiftBars.map((candle) => ({
      ...candle,
      open: -candle.open,
      high: -candle.low,
      low: -candle.high,
      close: -candle.close,
    }));
    const swingPoints = detectSwingPoints(bullishShiftBars, 1);
    const mssEvents = detectMSS(bullishShiftBars, swingPoints);

    expect(mssEvents).toEqual([
      { index: 8, type: "bearish", brokenLevel: -12 },
    ]);
    expect(detectOrderBlocks(bullishShiftBars, mssEvents)).toEqual([
      { index: 7, type: "bearish", top: -8, bottom: -9.5 },
    ]);
  });

  it("does not report a shift without an established trend or a close crossing the level", () => {
    const swingPoints = detectSwingPoints(bearishShiftBars, 1);
    const unchangedCloses = bearishShiftBars.map((candle) => ({ ...candle }));
    unchangedCloses[8].close = 11.5;

    expect(detectMSS(unchangedCloses, swingPoints)).toEqual([]);
    expect(detectMSS(bearishShiftBars.slice(0, 5), swingPoints.slice(0, 3))).toEqual([]);
  });

  it("validates the swing window size", () => {
    expect(() => detectSwingPoints(bearishShiftBars, 0)).toThrow("n must be a positive integer");
    expect(() => detectSwingPoints(bearishShiftBars, 1.5)).toThrow("n must be a positive integer");
  });
});