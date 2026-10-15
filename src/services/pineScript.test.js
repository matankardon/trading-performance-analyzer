import { beforeEach, describe, expect, it } from "vitest";
import { generatePine, PINE_SCRIPT_ID_STORAGE_KEY, readPineScriptId, writePineScriptId } from "./pineScript";

const fixtures = {
  bollingerOnly: {
    name: "Bands",
    version: 3,
    conditions: {
      bollingerConfirmation: true,
      indicatorSettings: { bollingerConfirmation: { period: 18, stdDevMultiplier: 2.4 } },
    },
  },
  bollingerAndRsi: {
    name: "Mean Reversion",
    version: 2,
    conditions: {
      bollingerConfirmation: true,
      rsiConfirmation: true,
      indicatorSettings: {
        bollingerConfirmation: { period: 21, stdDevMultiplier: 1.8 },
        rsiConfirmation: { period: 10, oversold: 25, overbought: 75 },
      },
    },
  },
  movingAveragesAndMacd: {
    name: "Trend",
    version: 1,
    conditions: {
      smaConfirmation: true,
      emaConfirmation: true,
      macdConfirmation: true,
      indicatorSettings: {
        smaConfirmation: { period: 40, priceRelation: "below" },
        emaConfirmation: { period: 12, priceRelation: "above" },
        macdConfirmation: { fastPeriod: 8, slowPeriod: 21, signalPeriod: 5, crossover: "bearish" },
      },
    },
  },
  fvgSessionStochastic: {
    name: "Session Setup",
    version: 4,
    session: "London",
    conditions: {
      fvg: true,
      stochasticConfirmation: true,
      indicatorSettings: { stochasticConfirmation: { kPeriod: 10, dPeriod: 4, oversold: 20, overbought: 80 } },
    },
  },
  manualOnly: {
    name: "Manual",
    version: 1,
    conditions: { liquiditySweep: true, mss: true, orderBlock: true },
  },
};

function assertBalancedPine(code) {
  const stack = [];
  let quoted = false;
  let escaped = false;
  let lineComment = false;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === "/" && code[index + 1] === "/") {
      lineComment = true;
      index += 1;
    } else if (character === '"') quoted = true;
    else if (character === "(") stack.push(character);
    else if (character === ")") expect(stack.pop()).toBe("(");
  }
  expect(quoted).toBe(false);
  expect(stack).toEqual([]);
}

describe("generatePine", () => {
  it("matches Pine output snapshots for supported indicator and setup combinations", () => {
    const generated = Object.fromEntries(Object.entries(fixtures).map(([key, version]) => [key, generatePine(version)]));
    expect(generated).toMatchSnapshot();
  });

  it("emits Pine v6 with one indicator declaration, balanced syntax, and no JavaScript artifacts", () => {
    Object.values(fixtures).forEach((fixture) => {
      const { scripts } = generatePine(fixture);
      scripts.forEach(({ code }) => {
        expect(code.startsWith("//@version=6")).toBe(true);
        expect(code.match(/\bindicator\s*\(/g)).toHaveLength(1);
        assertBalancedPine(code);
        expect(code).not.toMatch(/undefined|NaN|\[object|\$\{/);
      });
    });
  });

  it("uses the strategy's numeric parameter defaults in Pine inputs", () => {
    const { scripts } = generatePine(fixtures.movingAveragesAndMacd);
    const code = scripts[0].code + scripts[1].code;
    ["input.int(40", "input.int(12", "input.int(8", "input.int(21", "input.int(5"].forEach((input) => {
      expect(code).toContain(input);
    });
  });

  it("emits each selected setup gate once and uses the shared session definition", () => {
    const { scripts } = generatePine(fixtures.fvgSessionStochastic);
    const overlay = scripts.find(({ id }) => id === "overlay").code;
    expect(overlay.match(/strategySession = input\.session/g)).toHaveLength(1);
    expect(overlay.match(/inStrategySession =/g)).toHaveLength(1);
    expect(overlay.match(/setupStochKLength =/g)).toHaveLength(1);
    expect(overlay.match(/setupAligned =/g)).toHaveLength(1);
    expect(overlay).toContain('input.session("0300-1200"');
  });

  it("escapes strategy names in generated comments and indicator titles", () => {
    const { scripts } = generatePine({
      name: 'Scalp "Fast`Plan`"',
      version: 2,
      conditions: { smaConfirmation: true },
    });
    expect(scripts[0].code).toContain('Scalp \\"Fast\\`Plan\\`\\"');
    expect(scripts[0].code).toContain('indicator("Scalp \\"Fast`Plan`\\" v2 / Overlay"');
  });

  it("returns no scripts and a clear explanation for manual-only versions", () => {
    const result = generatePine(fixtures.manualOnly);
    expect(result.scripts).toEqual([]);
    expect(result.notIncluded).toEqual(expect.arrayContaining(["Liquidity Sweep", "MSS", "Order Block"]));
    expect(result.notIncluded.at(-1)).toMatch(/No supported indicator or setup condition/);
  });
});

describe("Pine script ID persistence", () => {
  beforeEach(() => localStorage.clear());

  it("stores IDs by strategy version and rejects unsafe input", () => {
    expect(writePineScriptId("strategy-v2", "abc_123")).toBe(true);
    expect(readPineScriptId("strategy-v2")).toBe("abc_123");
    expect(writePineScriptId("strategy-v2", "bad id")).toBe(false);
    expect(readPineScriptId("strategy-v2")).toBe("abc_123");
    expect(JSON.parse(localStorage.getItem(PINE_SCRIPT_ID_STORAGE_KEY))).toEqual({ "strategy-v2": "abc_123" });
  });
});
