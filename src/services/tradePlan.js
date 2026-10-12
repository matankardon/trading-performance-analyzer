function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateTradePlan({
  direction,
  entry,
  stopLoss,
  takeProfit,
  riskAmount,
  riskType = "amount",
  accountBalance,
} = {}) {
  const entryValue = numberOrNull(entry);
  const stopValue = numberOrNull(stopLoss);
  const targetValue = numberOrNull(takeProfit);
  const riskValue = numberOrNull(riskAmount);
  const balanceValue = numberOrNull(accountBalance);
  const normalizedDirection = String(direction ?? "").toLowerCase();
  const validDirection = normalizedDirection === "long" || normalizedDirection === "short";
  const stopDistance = entryValue !== null && stopValue !== null ? Math.abs(entryValue - stopValue) : null;
  const rewardDistance = entryValue !== null && targetValue !== null ? Math.abs(targetValue - entryValue) : null;
  const validSide = validDirection && entryValue !== null && stopValue !== null && (
    normalizedDirection === "long" ? stopValue < entryValue : stopValue > entryValue
  );
  const riskPerTrade = riskValue === null || riskValue <= 0
    ? null
    : riskType === "percent"
      ? balanceValue !== null && balanceValue > 0 ? balanceValue * riskValue / 100 : null
      : riskValue;
  const riskReward = validDirection && entryValue !== null && targetValue !== null && stopDistance > 0 && (
    normalizedDirection === "long" ? targetValue > entryValue : targetValue < entryValue
  ) ? rewardDistance / stopDistance : null;
  const suggestedPositionSize = validSide && stopDistance > 0 && riskPerTrade !== null
    ? riskPerTrade / stopDistance
    : null;

  return {
    riskReward: Number.isFinite(riskReward) ? riskReward : null,
    riskPerTrade: Number.isFinite(riskPerTrade) ? riskPerTrade : null,
    stopDistance: Number.isFinite(stopDistance) && stopDistance > 0 ? stopDistance : null,
    suggestedPositionSize: Number.isFinite(suggestedPositionSize) ? suggestedPositionSize : null,
  };
}
