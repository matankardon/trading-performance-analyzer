import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

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

function fileToBase64(selectedFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("The screenshot could not be read."));
    reader.readAsDataURL(selectedFile);
  });
}

function ScreenshotTradeWorkflow({ onClose, onConfirm, showConsent = false, onConsent }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [stage, setStage] = useState("upload");
  const [extraction, setExtraction] = useState(emptyExtraction);
  const [rawExtraction, setRawExtraction] = useState(null);
  const [conditionStates, setConditionStates] = useState(
    conditionFields.reduce((states, condition) => ({ ...states, [condition]: "NOT DETECTED" }), {})
  );
  const [notes, setNotes] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [aiAnalyzed, setAiAnalyzed] = useState(false);
  const [dontShowConsentAgain, setDontShowConsentAgain] = useState(false);

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

  async function handleAnalyze() {
    if (!file) {
      return;
    }

    const extractionAtStart = extraction;
    const conditionStatesAtStart = conditionStates;
    setAnalysisError("");
    setAiAnalyzed(false);
    setRawExtraction(null);
    setStage("analyzing");

    try {
      const image = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("screenshot-vision", {
        body: { image, mimeType: file.type },
      });

      if (error) {
        let contextBody;
        try {
          contextBody = error.context?.clone
            ? await error.context.clone().text()
            : error.context;
        } catch (contextError) {
          contextBody = `Unable to read error context: ${contextError.message}`;
        }
        console.error("screenshot-vision request failed", {
          error,
          message: error.message,
          status: error.status,
          contextBody,
        });
        throw new Error(error.message || "AI analysis could not be completed.");
      }

      if (!data?.extraction || !data?.conditionStates) {
        throw new Error("AI analysis returned an incomplete result.");
      }

      setRawExtraction({ ...data.extraction });
      setExtraction((previous) => (
        JSON.stringify(previous) === JSON.stringify(extractionAtStart)
          ? { ...emptyExtraction, ...data.extraction }
          : previous
      ));
      setConditionStates((previous) => (
        JSON.stringify(previous) === JSON.stringify(conditionStatesAtStart)
          ? { ...conditionFields.reduce((states, condition) => ({ ...states, [condition]: "NOT DETECTED" }), {}), ...data.conditionStates }
          : previous
      ));
      setAiAnalyzed(true);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "AI analysis could not be completed.");
      setExtraction((previous) => (
        JSON.stringify(previous) === JSON.stringify(extractionAtStart) ? emptyExtraction : previous
      ));
      setConditionStates((previous) => (
        JSON.stringify(previous) === JSON.stringify(conditionStatesAtStart)
          ? conditionFields.reduce((states, condition) => ({ ...states, [condition]: "NOT DETECTED" }), {})
          : previous
      ));
    } finally {
      setStage("review");
    }
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
    onConfirm({ extraction, notes, conditionStates, file, aiExtraction: rawExtraction });
  }

  async function handleConsentContinue() {
    const shouldContinue = await onConsent?.(dontShowConsentAgain);
    if (shouldContinue !== false) {
      setDontShowConsentAgain(false);
    }
  }

  if (showConsent) {
    return (
      <div className="modal-overlay" role="presentation">
        <div className="trade-modal screenshot-consent-modal" role="dialog" aria-modal="true" aria-labelledby="screenshot-consent-title">
          <div className="modal-header">
            <div>
              <p className="eyebrow">SCREENSHOT PRIVACY</p>
              <h2 id="screenshot-consent-title">Before you upload</h2>
            </div>
            <button className="close-btn" type="button" onClick={onClose} aria-label="Close screenshot workflow">×</button>
          </div>
          <p className="screenshot-consent-copy">
            Screenshots you upload are saved privately with your trade so you can view them later in your journal, and to help improve AI extraction accuracy over time. They are never shared or made public. A Settings-level opt-out is not available yet.
          </p>
          <label className="screenshot-consent-checkbox">
            <input type="checkbox" checked={dontShowConsentAgain} onChange={(event) => setDontShowConsentAgain(event.target.checked)} />
            <span>Don't show this again</span>
          </label>
          <div className="form-actions">
            <button className="cancel-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="save-btn" type="button" onClick={handleConsentContinue}>Continue to screenshot upload</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" role="presentation">
      <div className="trade-modal screenshot-workflow-modal" role="dialog" aria-modal="true" aria-labelledby="screenshot-workflow-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">SCREENSHOT TO JOURNAL</p>
            <h2 id="screenshot-workflow-title">{stage === "review" ? "Review extracted trade" : stage === "analyzing" ? "Analyzing screenshot" : "Upload trade screenshot"}</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose} aria-label="Close screenshot workflow">×</button>
        </div>

        <div className="workflow-steps" aria-label="Screenshot workflow progress">
          {["Upload", "Analyze", "Review", "Save"].map((step, index) => <span className={stage === "review" && index < 3 ? "complete" : index === 0 && stage !== "upload" ? "complete" : ""} key={step}>{index + 1}. {step}</span>)}
        </div>

        {stage === "analyzing" ? (
          <div className="workflow-loading" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <strong>Analyzing screenshot...</strong>
            <span>Extracting visible trade details. You can review and edit every result before saving.</span>
          </div>
        ) : stage !== "review" ? (
          <>
            <div className="screenshot-dropzone">
              <span className="empty-state-mark" aria-hidden="true">IMG</span>
              <h3>Upload Trade Screenshot</h3>
              <p>Use a TradingView, desktop chart, mobile chart, or supported platform screenshot. This screenshot will be saved privately with this trade so you can view it later in your journal and to help improve AI extraction accuracy over time. It is never shared or made public.</p>
              <label className="secondary-btn screenshot-file-label">
                Choose image
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
              </label>
              {file && <strong className="selected-file">{file.name}</strong>}
            </div>
            <div className="workflow-notice"><strong>AI analysis is connected.</strong><span>Results are drafts only. Review every field before saving.</span></div>
            <div className="form-actions"><button className="cancel-btn" type="button" onClick={onClose}>Cancel</button><button className="save-btn" type="button" disabled={!file} onClick={handleAnalyze}>Continue to review</button></div>
          </>
        ) : (
          <>
            <div className="screenshot-review-layout">
              <div className="screenshot-preview-panel">
                {previewUrl ? <img src={previewUrl} alt="Temporary trade screenshot preview" /> : <span>Preview unavailable</span>}
                <small>This screenshot will be saved privately with this trade so you can view it later in your journal and to help improve AI extraction accuracy over time. It is never shared or made public.</small>
              </div>
              <div className="extraction-review-panel">
                <div className="review-heading"><div><p className="eyebrow">TRADE DETECTED</p><h3>Review before saving</h3></div><span className="confidence-badge confidence-not-detected">{aiAnalyzed ? "AI EXTRACTED" : "NOT DETECTED"}</span></div>
                <p className="review-disclaimer">{analysisError || (aiAnalyzed ? "AI-extracted data is a draft — verify every field before saving." : "Enter or correct values manually before continuing.")}</p>
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
