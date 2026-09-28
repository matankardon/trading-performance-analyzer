import { calculateStochastic, isStochasticConfirming } from "./stochastic";

function bar(close, timestamp = 0) {
  return { timestamp, open: close, high: 100, low: 0, close, volume: 100 };
}

describe("stochastic oscillator", () => {
  it("calculates hand-verified %K and %D values with bar-aligned warmup", () => {
    const values = calculateStochastic([bar(10), bar(10), bar(10), bar(10), bar(30)], 3, 2);

    expect(values).toEqual([
      null,
      null,
      null,
      { confirmedAt: 3, k: 10, d: 10, previousK: 10, previousD: null },
      { confirmedAt: 4, k: 30, d: 20, previousK: 10, previousD: 10 },
    ]);
  });

  it("confirms bullish and bearish crosses from their respective extremes", () => {
    const bullish = calculateStochastic([bar(10), bar(10), bar(10), bar(10), bar(30)], 3, 2)[4];
    const bearish = calculateStochastic([bar(90), bar(90), bar(90), bar(90), bar(70)], 3, 2)[4];

    expect(isStochasticConfirming(bullish, "long")).toBe(true);
    expect(isStochasticConfirming(bearish, "short")).toBe(true);
    expect(isStochasticConfirming(bullish, "short")).toBe(false);
    expect(isStochasticConfirming(null, "long")).toBe(false);
  });

  it("rejects flat-range oscillator values and invalid periods", () => {
    const flatBars = Array.from({ length: 4 }, (_, index) => ({ ...bar(5, index), high: 5, low: 5 }));

    expect(calculateStochastic(flatBars, 2, 2)).toEqual([null, null, null, null]);
    expect(() => calculateStochastic([], 0, 3)).toThrow("kPeriod must be a positive integer");
  });
});