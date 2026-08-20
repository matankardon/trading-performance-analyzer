import { useEffect, useState } from "react";

const extractionFields = [
  ["asset", "Asset"],
  ["direction", "Direction"],
  ["entry", "Entry"],
  ["exit", "Exit"],
  ["stopLoss", "Stop Loss"],
  ["takeProfit", "Take Profit"],
  ["pnl", "P&L"],
  ["date", "Date"],
  ["time", "Time"],
  ["timeframe", "Timeframe"],
  ["positionSize", "Position size"],
  ["riskReward", "Risk / reward"],
  ["strategy", "Strategy"],
];

const conditionFields = [
  "Liquidity Sweep",
  "MSS",
  "FVG",
  "Displacement",
  "Order Block",
  "Stochastic Confirmation",
];

const emptyExtraction = extractionFields.reduce(
  (fields, [key]) => ({ ...fields, [key]: "" }),
  {}
);

function ScreenshotTradeWorkflow({ onClose, onConfirm }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [stage, setStage] = useState("upload");
  const [extraction, setExtraction] = useState(emptyExtraction);
  const [conditionStates, setConditionStates] = useState(
    conditionFields.reduce((states, condition) => ({ ...states, [condition]: "NOT DETECTED" }), {})
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!previewUrl) {
      return undefined;
    }

    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : "");
    setStage(nextFile ? "ready" : "upload");
  }

  function handleAnalyze() {
    if (!file) {
      return;
    }

    setStage("review");
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setExtraction((previous) => ({ ...previous, [name]: value }));
  }

  function handleConditionChange(event) {
    const { name, value } = event.target;
    setConditionStates((previous) => ({ ...previous, [name]: value }));
  }

  function handleConfirm() {
    onConfirm({ extraction, notes, conditionStates });
  }

  return (
    <div className="modal-overlay" role="presentation">
      <div className="trade-modal screenshot-workflow-modal" role="dialog" aria-modal="true" aria-labelledby="screenshot-workflow-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">SCREENSHOT TO JOURNAL</p>
            <h2 id="screenshot-workflow-title">{stage === "review" ? "Review extracted trade" : "Upload trade screenshot"}</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose} aria-label="Close screenshot workflow">×</button>
        </div>

        <div className="workflow-steps" aria-label="Screenshot workflow progress">
          {["Upload", "Analyze", "Review", "Save"].map((step, index) => <span className={stage === "review" && index < 3 ? "complete" : index === 0 && stage !== "upload" ? "complete" : ""} key={step}>{index + 1}. {step}</span>)}
        </div>

        {stage !== "review" ? (
          <>
            <div className="screenshot-dropzone">
              <span className="empty-state-mark" aria-hidden="true">IMG</span>
              <h3>Upload Trade Screenshot</h3>
              <p>Use a TradingView, desktop chart, mobile chart, or supported platform screenshot. The preview is temporary and is not persisted.</p>
              <label className="secondary-btn screenshot-file-label">
                Choose image
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
              </label>
              {file && <strong className="selected-file">{file.name}</strong>}
            </div>
            <div className="workflow-notice"><strong>AI analysis is not connected.</strong><span>This review will begin with every field marked NOT DETECTED. Nothing will be saved automatically.</span></div>
            <div className="form-actions"><button className="cancel-btn" type="button" onClick={onClose}>Cancel</button><button className="save-btn" type="button" disabled={!file} onClick={handleAnalyze}>Continue to review</button></div>
          </>
        ) : (
          <>
            <div className="screenshot-review-layout">
              <div className="screenshot-preview-panel">
                {previewUrl ? <img src={previewUrl} alt="Temporary trade screenshot preview" /> : <span>Preview unavailable</span>}
                <small>Temporary preview only. No image blob is stored in the journal.</small>
              </div>
              <div className="extraction-review-panel">
                <div className="review-heading"><div><p className="eyebrow">TRADE DETECTED</p><h3>Review before saving</h3></div><span className="confidence-badge confidence-not-detected">NOT DETECTED</span></div>
                <p className="review-disclaimer">No image-analysis provider is connected. Enter or correct values manually before continuing.</p>
                <div className="extraction-grid">{extractionFields.map(([key, label]) => <label className="extraction-field" key={key}><span>{label}<em>NOT DETECTED</em></span><input name={key} value={extraction[key]} onChange={handleFieldChange} placeholder="Not detected" /></label>)}</div>
                <div className="detected-conditions"><p className="eyebrow">DETECTED SETUP CONDITIONS</p>{conditionFields.map((condition) => <label key={condition}><span>{condition}</span><select name={condition} value={conditionStates[condition]} onChange={handleConditionChange}><option>NOT DETECTED</option><option>CONFIDENT</option><option>LIKELY</option><option>UNCERTAIN</option></select></label>)}</div>
                <label className="form-field screenshot-notes"><span>Notes / context</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context after reviewing the screenshot" rows="3" /></label>
              </div>
            </div>
            <div className="workflow-notice"><strong>Confirm first, save second.</strong><span>Confirming will prefill the existing Trade Form. You will still submit through the existing saveTrade flow.</span></div>
            <div className="form-actions"><button className="cancel-btn" type="button" onClick={onClose}>Cancel</button><button className="save-btn" type="button" onClick={handleConfirm}>Confirm and open Trade Form</button></div>
          </>
        )}
      </div>
    </div>
  );
}

export default ScreenshotTradeWorkflow;
