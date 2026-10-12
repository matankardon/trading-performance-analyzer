import { useEffect, useMemo, useState } from "react";
import { calculateTradePlan } from "../services/tradePlan";
import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";

function formatValue(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

export default function TradePlanPanel({
  symbol,
  strategy,
  version,
  session,
  checked = {},
  onToggle = () => {},
  onPlanChange = () => {},
  onLogTrade = () => {},
}) {
  const [direction, setDirection] = useState("Long");
  const [entry, setEntry] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [riskAmount, setRiskAmount] = useState("");
  const [riskType, setRiskType] = useState("amount");
  const [accountBalance, setAccountBalance] = useState("");
  const plan = useMemo(
    () => calculateTradePlan({ direction, entry, stopLoss, takeProfit, riskAmount, riskType, accountBalance }),
    [accountBalance, direction, entry, riskAmount, riskType, stopLoss, takeProfit],
  );
  const planValues = useMemo(
    () => ({ direction, entry, stopLoss, takeProfit, riskAmount, riskType, accountBalance, ...plan }),
    [accountBalance, direction, entry, plan, riskAmount, riskType, stopLoss, takeProfit],
  );
  useEffect(() => {
    onPlanChange(planValues);
  }, [onPlanChange, planValues]);
  const conditions = Object.fromEntries(SETUP_CONDITIONS.map(({ key }) => [key, Boolean(checked[key])]));
  const indicators = INDICATORS.filter(({ key }) => checked[key]).map(({ name }) => name);

  function logTrade() {
    onLogTrade({
      asset: symbol,
      direction,
      entry: entry === "" ? "" : Number(entry),
      stopLoss: stopLoss === "" ? "" : Number(stopLoss),
      takeProfit: takeProfit === "" ? "" : Number(takeProfit),
      riskReward: plan.riskReward,
      strategy: strategy?.name || "",
      strategyVersionId: version?.id || null,
      session: session || strategy?.session || "New York",
      indicators,
      ...conditions,
    });
  }

  return (
    <section className="trading-workspace-card chart-trade-plan">
      <p className="eyebrow">TRADE PLAN · DECISION SUPPORT ONLY</p>
      <p className="chart-plan-caveat">Embedded charts cannot place orders or read prices drawn on them. Enter levels here.</p>
      <div className="chart-plan-fields">
        <label>Direction<select aria-label="Trade plan direction" value={direction} onChange={(event) => setDirection(event.target.value)}><option>Long</option><option>Short</option></select></label>
        <label>Entry<input aria-label="Trade plan entry" type="number" value={entry} onChange={(event) => setEntry(event.target.value)} /></label>
        <label>Stop loss<input aria-label="Trade plan stop loss" type="number" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} /></label>
        <label>Take profit<input aria-label="Trade plan take profit" type="number" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} /></label>
        <label>Account risk<select aria-label="Account risk type" value={riskType} onChange={(event) => setRiskType(event.target.value)}><option value="amount">$ amount</option><option value="percent">% of balance</option></select></label>
        <label>{riskType === "percent" ? "Risk (%)" : "Risk ($)"}<input aria-label="Account risk" type="number" min="0" value={riskAmount} onChange={(event) => setRiskAmount(event.target.value)} /></label>
        {riskType === "percent" && <label>Account balance ($)<input aria-label="Account balance" type="number" min="0" value={accountBalance} onChange={(event) => setAccountBalance(event.target.value)} /></label>}
      </div>
      <div className="chart-plan-results" aria-live="polite">
        <span>R:R <strong>{formatValue(plan.riskReward)}{plan.riskReward === null ? "" : ":1"}</strong></span>
        <span>Risk per trade <strong>{plan.riskPerTrade === null ? "—" : `$${formatValue(plan.riskPerTrade)}`}</strong></span>
        <span>Suggested size <strong>{formatValue(plan.suggestedPositionSize, 4)}</strong></span>
      </div>
      <small className="chart-muted-note">Position size is risk ÷ price distance only. Contract multipliers, lot size, pip value, fees, and instrument-specific value are not included.</small>
      <div className="setup-checklist chart-plan-checklist">
        {[...SETUP_CONDITIONS, ...INDICATORS].map(({ key, label }) => <label className="setup-check-chip" key={key}>
          <input type="checkbox" checked={Boolean(checked[key])} onChange={() => onToggle(key)} />
          {label}
        </label>)}
      </div>
      <button type="button" className="add-trade-btn" onClick={logTrade}>Log this trade</button>
      <small className="chart-planning-note">Planning tool — orders are not placed from this site.</small>
    </section>
  );
}
