function TickerTypewriter() {
  return (
    <span className="trade-entry-choice-ticker-list">
      <span>QQQ <em>+1.24%</em></span>
      <span>SPX <em>+0.68%</em></span>
      <span>AAPL <b>-0.42%</b></span>
      <span>TSLA <b>-1.08%</b></span>
    </span>
  );
}

function TradeEntryChoiceModal({ onClose, onManualEntry, onScreenshotEntry }) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="trade-modal trade-entry-choice-modal" role="dialog" aria-modal="true" aria-labelledby="trade-entry-choice-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">NEW JOURNAL ENTRY</p>
            <h2 id="trade-entry-choice-title">How would you like to add this trade?</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose} aria-label="Close add trade options">×</button>
        </div>
        <div className="trade-entry-choice-grid">
          <button className="trade-entry-choice-card" type="button" onClick={onScreenshotEntry}>
            <span className="trade-entry-choice-header">
              <strong>Upload Screenshot</strong>
              <span className="trade-entry-choice-icon" aria-hidden="true">IMG</span>
              <span className="trade-entry-choice-divider" aria-hidden="true" />
            </span>
            <span className="trade-entry-choice-lower trade-entry-choice-chart-area" aria-hidden="true">
              <svg className="trade-entry-choice-chart" viewBox="0 0 520 150" focusable="false">
                <g className="trade-entry-choice-chart-grid">
                  <path d="M0 30H520M0 75H520M0 120H520M44 0V150M124 0V150M204 0V150M284 0V150M364 0V150M444 0V150" />
                </g>
                <g className="trade-entry-choice-chart-candles">
                  <path d="M16 128V86M42 112V60M68 98V42M94 84V32M120 108V50M146 74V22M172 94V40M198 70V18M224 58V12M250 92V34M276 112V54M302 98V38M328 76V20M354 58V10M380 76V24M406 102V42M432 84V28M458 62V14M484 48V8" />
                  <path className="trade-entry-choice-chart-rising-line" d="M0 132L42 112L68 98L94 82L120 96L146 70L172 84L198 60L224 50L250 74L276 96L302 84L328 62L354 46L380 62L406 86L432 66L458 44L484 30L520 16" />
                </g>
              </svg>
              <span className="trade-entry-choice-description">Extract visible trade details, review them, then open the Trade Form.</span>
            </span>
          </button>
          <button className="trade-entry-choice-card" type="button" onClick={onManualEntry}>
            <span className="trade-entry-choice-header">
              <strong>Manual Entry</strong>
              <span className="trade-entry-choice-icon" aria-hidden="true">+</span>
              <span className="trade-entry-choice-divider" aria-hidden="true" />
            </span>
            <span className="trade-entry-choice-lower trade-entry-choice-ticker-area" aria-hidden="true">
              <TickerTypewriter />
              <span className="trade-entry-choice-description">Enter the trade details directly in the existing Trade Form.</span>
            </span>
          </button>
        </div>
        <div className="form-actions">
          <button className="cancel-btn" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default TradeEntryChoiceModal;