import { calculateTakeProfitPercent } from "./backtestParameters";

function parseRequiredNumber(value, label, { percent = false, allowZero = false } = {}) {
  const number = Number(String(value ?? "").trim().replace(/%$/, ""));
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return percent ? number / 100 : number;
}

function parseRiskPerTradePercent(value) {
  const numericValue = Number(String(value ?? "").trim().replace(/%$/, ""));
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 100) {
    throw new Error("Risk per trade must be a number greater than 0 and no more than 100%.");
  }
  return numericValue / 100;
}

export function buildBacktestConfig(request, strategyVersion = {}) {
  const stopLossPercent = parseRequiredNumber(request.stopLossPct, "Stop-loss", { percent: false });
  const riskRewardRatio = parseRequiredNumber(request.riskRewardRatio, "Risk:Reward ratio");
  const startingBalance = parseRequiredNumber(request.startingBalance, "Starting balance");
  const riskMode = request.riskMode || "percent";
  const riskInput = Number(String(request.riskPerTrade ?? "").trim().replace(/%$/, ""));
  let riskPerTrade;
  let riskCapital;
  if (riskMode === "dollars") {
    if (!Number.isFinite(riskInput) || riskInput <= 0 || riskInput > startingBalance) {
      throw new Error("Dollar risk must be greater than zero and no more than starting balance.");
    }
    riskCapital = riskInput;
  } else if (riskMode === "percent") {
    riskPerTrade = parseRiskPerTradePercent(request.riskPerTrade);
  } else {
    throw new Error("Risk mode must be percent or dollars.");
  }
  const conditions = strategyVersion.conditions || {};
  const sensitivity = {
    swingSize: Number(request.swingSize),
    sweepDetectionLookback: Number(request.sweepDetectionLookback),
    sweepLookback: Number(request.sweepLookback),
    setupLookback: Number(request.setupLookback),
    stochasticKPeriod: Number(request.stochasticKPeriod),
    stochasticDPeriod: Number(request.stochasticDPeriod),
  };

  const normalizedDirection = String(strategyVersion.direction || "long").toLowerCase();
  const direction = normalizedDirection.includes("both")
    || (normalizedDirection.includes("long") && normalizedDirection.includes("short"))
    ? "both"
    : normalizedDirection.includes("short") && !normalizedDirection.includes("long") ? "short" : "long";

  return {
    historicalRequest: {
      asset: String(request.asset || "").trim().toUpperCase(),
      timeframe: request.timeframe,
      startDate: request.startDate,
      endDate: request.endDate,
    },
    engine: {
      ...(riskMode === "dollars" ? { riskCapital } : { riskPerTrade }),
      startingBalance,
      stopLossPct: stopLossPercent / 100,
      takeProfitPct: calculateTakeProfitPercent(stopLossPercent, riskRewardRatio) / 100,
      commissionPerTrade: parseRequiredNumber(request.commissionPerTrade, "Commission per trade", { allowZero: true }),
      slippagePct: parseRequiredNumber(request.slippagePct, "Slippage", { percent: true, allowZero: true }),
      direction,
    },
    entryRuleOptions: {
      requireSweep: Boolean(conditions.liquiditySweep),
      requireMss: Boolean(conditions.mss),
      requireFvg: Boolean(conditions.fvg),
      requireDisplacement: Boolean(conditions.displacement),
      requireOrderBlock: Boolean(conditions.orderBlock),
      requireStoch: Boolean(conditions.stochasticConfirmation),
      session: request.session || "All sessions",
      ...sensitivity,
    },
  };
}