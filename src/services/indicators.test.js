import {
  calculateADX,
  calculateBollingerBands,
  calculateEMA,
  calculateFibonacciLevels,
  calculateIchimoku,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateStdDev,
} from "./indicators";

function barsFromCloses(closes) {
  return closes.map((close, timestamp) => ({
    timestamp,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }));
}

describe("technical indicators", () => {
  it("calculates SMA and EMA with explicit warmup and seed", () => {
    const bars = barsFromCloses([1, 2, 3, 4]);

    expect(calculateSMA(bars, 2)).toEqual([null, 1.5, 2.5, 3.5]);
    expect(calculateEMA(bars, 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it("calculates Wilder RSI from hand-computed average gain and loss", () => {
    const values = calculateRSI(barsFromCloses([1, 2, 1, 2]), 2);

    expect(values.slice(0, 2)).toEqual([null, null]);
    expect(values[2]).toBe(50);
    expect(values[3]).toBeCloseTo(75, 10);
  });

  it("calculates MACD, signal EMA, and histogram from short EMA periods", () => {
    const values = calculateMACD(barsFromCloses([1, 2, 3, 5, 7]), 2, 3, 2);

    expect(values[0]).toBeNull();
    expect(values[1]).toBeNull();
    expect(values[2]).toBeNull();
    expect(values[3].macd).toBeCloseTo(2 / 3, 10);
    expect(values[3].signal).toBeCloseTo(7 / 12, 10);
    expect(values[3].histogram).toBeCloseTo(1 / 12, 10);
    expect(values[4].macd).toBeCloseTo(29 / 36, 10);
    expect(values[4].signal).toBeCloseTo(79 / 108, 10);
    expect(values[4].histogram).toBeCloseTo(8 / 108, 10);
  });

  it("calculates population Bollinger bands around the rolling mean", () => {
    const values = calculateBollingerBands(barsFromCloses([1, 3, 5]), 2, 2);

    expect(values[0]).toBeNull();
    expect(values[1]).toEqual({ upper: 4, middle: 2, lower: 0 });
    expect(values[2]).toEqual({ upper: 6, middle: 4, lower: 2 });
  });

  it("calculates Wilder ADX as 100 for a strictly directional sequence", () => {
    const values = calculateADX(barsFromCloses([1, 2, 3, 4, 5]), 2);

    expect(values.slice(0, 3)).toEqual([null, null, null]);
    expect(values[3]).toBe(100);
    expect(values[4]).toBe(100);
  });

  it("calculates standard Fibonacci retracements from rolling swing high and low", () => {
    const value = calculateFibonacciLevels(barsFromCloses([9, 11, 12]), 3)[2];

    expect(value.swingHigh).toBe(13);
    expect(value.swingLow).toBe(8);
    expect(value.levels[0.236]).toBeCloseTo(11.82, 10);
    expect(value.levels[0.382]).toBeCloseTo(11.09, 10);
    expect(value.levels[0.5]).toBe(10.5);
    expect(value.levels[0.618]).toBeCloseTo(9.91, 10);
    expect(value.levels[0.786]).toBeCloseTo(9.07, 10);
  });

  it("calculates Ichimoku conversion/base lines and cloud spans without forward shifting", () => {
    const values = calculateIchimoku(barsFromCloses([9, 11, 12]), 2, 2, 3);

    expect(values[0]).toBeNull();
    expect(values[1]).toBeNull();
    expect(values[2]).toEqual({ conversionLine: 11.5, baseLine: 11.5, spanA: 11.5, spanB: 10.5 });
  });

  it("calculates population standard deviation on the trailing close window", () => {
    const values = calculateStdDev(barsFromCloses([1, 3, 5]), 2);

    expect(values[0]).toBeNull();
    expect(values[1]).toBe(1);
    expect(values[2]).toBe(1);
  });
});
