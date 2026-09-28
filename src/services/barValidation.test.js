import { validateBars } from "./barValidation";

const validBars = [
  { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { timestamp: 2, open: 11, high: 13, low: 10, close: 12, volume: 0 },
];

describe("historical bar validation", () => {
  it("accepts ascending, structurally valid bars with zero volume allowed", () => {
    expect(validateBars(validBars)).toBe(true);
  });

  it.each([
    ["duplicate timestamps", [{ ...validBars[0] }, { ...validBars[1], timestamp: 1 }], "timestamp"],
    ["descending timestamps", [{ ...validBars[1] }, { ...validBars[0] }], "timestamp"],
    ["non-positive prices", [{ ...validBars[0], low: 0 }], "positive"],
    ["invalid high", [{ ...validBars[0], high: 10.5 }], "high"],
    ["invalid low", [{ ...validBars[0], low: 10.5 }], "low"],
    ["negative volume", [{ ...validBars[0], volume: -1 }], "volume"],
  ])("rejects %s", (_name, bars, message) => {
    expect(() => validateBars(bars)).toThrow(message);
  });
});