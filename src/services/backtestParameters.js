export function calculateTakeProfitPercent(stopLossPercent, riskRewardRatio) {
  return Number(stopLossPercent) * Number(riskRewardRatio);
}