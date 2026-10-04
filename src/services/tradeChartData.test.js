import { getTradeChartWindow } from "./tradeChartData";

const bars = Array.from({ length: 40 }, (_, timestamp) => ({
  timestamp,
  open: 100 + timestamp,
  high: 102 + timestamp,
  low: 99 + timestamp,
  close: 101 + timestamp,
  volume: 100,
}));

describe("trade chart bar window", () => {
  it("returns ten bars before entry through ten after exit, preserving source indexes", () => {
    const window = getTradeChartWindow(bars, { entryIndex: 15, exitIndex: 20 });

    expect(window).toHaveLength(26);
    expect(window[0].sourceIndex).toBe(5);
    expect(window.at(-1).sourceIndex).toBe(30);
  });

  it("bounds the window at available history near the first and last bars", () => {
    expect(getTradeChartWindow(bars, { entryIndex: 2, exitIndex: 4 })[0].sourceIndex).toBe(0);
    expect(getTradeChartWindow(bars, { entryIndex: 35, exitIndex: 39 }).at(-1).sourceIndex).toBe(39);
  });
});
