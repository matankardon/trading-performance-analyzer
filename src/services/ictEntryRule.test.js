import { ictEntryRule } from "./ictEntryRule";

function bar(open, high, low, close, timestamp) {
  return { timestamp, open, high, low, close, volume: 100 };
}

function confluenceBars() {
  return [
    bar(11, 12, 10, 11, 0),
    bar(12, 14, 11, 13, 1),
    bar(11, 12, 9, 10, 2),
    bar(12, 13, 10, 12, 3),
    bar(10, 11, 8, 9, 4),
    bar(11, 12, 9, 11, 5),
    bar(9, 10, 7, 8, 6),
    bar(9.4, 9.5, 6, 8.5, 7),
    bar(10, 14, 8.5, 13, 8),
    bar(13, 13.5, 9.51, 9.51, 9),
    bar(9.6, 13, 9, 12.5, 10),
  ];
}

const testOptions = {
  requireSweep: true,
  requireMss: true,
  requireFvg: true,
  requireOrderBlock: true,
  requireStoch: true,
  swingSize: 1,
  sweepDetectionLookback: 2,
  sweepLookback: 3,
  setupLookback: 5,
  stochasticKPeriod: 2,
  stochasticDPeriod: 2,
};

function longSignalIndices(bars, options = testOptions) {
  const entryRule = ictEntryRule(bars, options);
  return bars.flatMap((_, index) => (
    entryRule({ bars, index, direction: "long" }) ? [index] : []
  ));
}

describe("ICT composite entry rule", () => {
  it("signals only on the verified post-MSS zone retest with sweep and stochastic confluence", () => {
    const bars = confluenceBars();

    expect(longSignalIndices(bars)).toEqual([10]);
  });

  it("does not signal when no qualifying liquidity sweep precedes the MSS", () => {
    const bars = confluenceBars();
    bars[7] = { ...bars[7], low: 7.5 };

    expect(longSignalIndices(bars, { ...testOptions, sweepLookback: 1 })).toEqual([]);
  });

  it("supports independently disabled conditions while retaining selected gates", () => {
    const bars = confluenceBars();
    bars[7] = { ...bars[7], low: 7.5 };

    expect(longSignalIndices(bars, { ...testOptions, requireSweep: false })).toEqual([10]);
    expect(longSignalIndices(bars, {
      ...testOptions,
      requireSweep: false,
      requireMss: false,
      requireFvg: true,
      requireOrderBlock: false,
      requireStoch: false,
    })).toEqual([10]);
  });

  it("rejects strategies that require unsupported displacement detection or no conditions", () => {
    const bars = confluenceBars();

    expect(() => ictEntryRule(bars, { ...testOptions, requireDisplacement: true }))
      .toThrow("Displacement detection is not implemented");
    expect(() => ictEntryRule(bars, {
      requireSweep: false,
      requireMss: false,
      requireFvg: false,
      requireOrderBlock: false,
      requireStoch: false,
    })).toThrow("Enable at least one implemented strategy condition");
  });
});