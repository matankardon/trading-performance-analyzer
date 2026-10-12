import { calculateTradePlan } from "../services/tradePlan";

function formatValue(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

export default function StrategyPositionSize({ values, onChange }) {
  const plan = calculateTradePlan(values);
  const update = (key) => (event) => onChange({ ...values, [key]: event.target.value });

  return (
    <section className="trading-workspace-card strategy-position-card">
      <p className="eyebrow">POSITION SIZE</p>
      <div className="strategy-position-fields">
        <label>Direction<select aria-label="Position direction" value={values.direction} onChange={update("direction")}><option>Long</option><option>Short</option></select></label>
        <label>Entry<input aria-label="Position entry" type="number" value={values.entry} onChange={update("entry")} /></label>
        <label>Stop<input aria-label="Position stop" type="number" value={values.stopLoss} onChange={update("stopLoss")} /></label>
        <label>Take profit<input aria-label="Position take profit" type="number" value={values.takeProfit} onChange={update("takeProfit")} /></label>
        <label>Risk type<select aria-label="Position risk type" value={values.riskType} onChange={update("riskType")}><option value="amount">$ amount</option><option value="percent">% of balance</option></select></label>
        <label>{values.riskType === "percent" ? "Risk (%)" : "Account risk ($)"}<input aria-label="Position account risk" type="number" min="0" value={values.riskAmount} onChange={update("riskAmount")} /></label>
        {values.riskType === "percent" && <label>Account balance ($)<input aria-label="Position account balance" type="number" min="0" value={values.accountBalance} onChange={update("accountBalance")} /></label>}
      </div>
      <div className="strategy-position-results" aria-live="polite">
        <span>R:R <strong>{formatValue(plan.riskReward)}{plan.riskReward === null ? "" : ":1"}</strong></span>
        <span>Risk per trade <strong>{plan.riskPerTrade === null ? "—" : `$${formatValue(plan.riskPerTrade)}`}</strong></span>
        <span>Suggested size <strong>{formatValue(plan.suggestedPositionSize, 4)}</strong></span>
      </div>
      <small className="strategy-evidence-note">Position size is risk ÷ stop distance. Instrument multipliers, lot/pip value, and fees are not included.</small>
    </section>
  );
}
