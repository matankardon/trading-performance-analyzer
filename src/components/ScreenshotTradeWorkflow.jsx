import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";

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

const numericExtractionFields = new Set([
  "entry",
  "exit",
  "stopLoss",
  "takeProfit",
  "positionSize",
  "riskReward",
  "pnl",
]);

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

function numericMatch(value) {
  return String(value ?? "").trim().match(/^[+-]?(?:\d[\d,]*\.?\d*|\.\d+)/);
}

function extractNumericValue(value) {
  const match = numericMatch(value);
  return match ? match[0].replace(/,/g, "") : "";
}

function getAnnotation(value) {
  const match = numericMatch(value);
  return match ? String(value).trim().slice(match[0].length).trim() : "";
}

function ScreenshotTradeWorkflow({ onClose, onConfirm, showConsent = false, onConsent, strategies = [], trades = [] }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [stage, setStage] = useState("upload");
  const [extraction, setExtraction] = useState(emptyExtraction);
  const [rawExtraction, setRawExtraction] = useState(null);
  const [conditionStates, setConditionStates] = useState(
    SETUP_CONDITIONS.reduce((states, { label }) => ({ ...states, [label]: "NOT DETECTED" }), {})
  );
  const [indicators, setIndicators] = useState([]);
  const [strategyVersionId, setStrategyVersionId] = useState("");
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
    const indicatorsAtStart = indicators;
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

      const matchingStrategy = strategies.find((strategy) => strategy.name === data.extraction.strategy);
      const extractedIndicators = INDICATORS
        .filter(({ name }) => Array.isArray(data.indicators) && data.indicators.includes(name))
        .map(({ name }) => name);
      setRawExtraction({ ...data.extraction, indicators: extractedIndicators });
      setExtraction((previous) => (
        JSON.stringify(previous) === JSON.stringify(extractionAtStart)
          ? { ...emptyExtraction, ...data.extraction, strategy: matchingStrategy?.name || "" }
          : previous
      ));
      setConditionStates((previous) => (
        JSON.stringify(previous) === JSON.stringify(conditionStatesAtStart)
          ? { ...SETUP_CONDITIONS.reduce((states, { label }) => ({ ...states, [label]: "NOT DETECTED" }), {}), ...data.conditionStates }
          : previous
      ));
      setIndicators((previous) => JSON.stringify(previous) === JSON.stringify(indicatorsAtStart) ? extractedIndicators : previous);
      setStrategyVersionId("");
      setAiAnalyzed(true);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "AI analysis could not be completed.");
      setExtraction((previous) => (
        JSON.stringify(previous) === JSON.stringify(extractionAtStart) ? emptyExtraction : previous
      ));
      setConditionStates((previous) => (
        JSON.stringify(previous) === JSON.stringify(conditionStatesAtStart)
          ? SETUP_CONDITIONS.reduce((states, { label }) => ({ ...states, [label]: "NOT DETECTED" }), {})
          : previous
      ));
      setIndicators((previous) => JSON.stringify(previous) === JSON.stringify(indicatorsAtStart) ? [] : previous);
      setStrategyVersionId("");
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

  function handleStrategyChange(event) {
    setExtraction((previous) => ({ ...previous, strategy: event.target.value }));
    setStrategyVersionId("");
  }

  function handleIndicatorToggle(indicator) {
    setIndicators((previous) => previous.includes(indicator)
      ? previous.filter((item) => item !== indicator)
      : [...previous, indicator]);
  }

  function handleBack() {
    if (stage === "review") {
      setStage("ready");
    } else if (stage === "ready") {
      setStage("upload");
    }
  }

  function handleConfirm() {
    onConfirm({ extraction, notes, conditionStates, file, aiExtraction: rawExtraction, indicators, strategyVersionId });
  }

  const selectedStrategy = strategies.find((strategy) => strategy.name === extraction.strategy);
  const selectedVersion = selectedStrategy?.versions.find((version) => version.id === strategyVersionId);
  const forwardTradeCount = selectedVersion
    ? trades.filter((trade) => trade.strategyVersionId === selectedVersion.id).length
    : 0;

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
            <div className="form-actions">{stage === "ready" && <button className="cancel-btn" type="button" onClick={handleBack}>Back</button>}<button className="cancel-btn" type="button" onClick={onClose}>Cancel</button><button className="save-btn" type="button" disabled={!file} onClick={handleAnalyze}>Continue to review</button></div>
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
                <div className="extraction-grid">{extractionFields.map(([key, label]) => {
                  if (key === "strategy") {
                    return <label className="extraction-field" key={key}><span>{label}<em>NOT DETECTED</em></span><select name={key} value={extraction.strategy} onChange={handleStrategyChange}><option value="">Select strategy</option>{strategies.map((strategy) => <option value={strategy.name} key={strategy.id}>{strategy.name}</option>)}</select></label>;
                  }
                  const isNumeric = numericExtractionFields.has(key);
                  const annotation = isNumeric ? getAnnotation(extraction[key]) : "";
                  return <label className="extraction-field" key={key}><span>{label}<em>NOT DETECTED</em></span><input name={key} type={isNumeric ? "number" : "text"} step={isNumeric ? "any" : undefined} value={isNumeric ? extractNumericValue(extraction[key]) : extraction[key]} onChange={handleFieldChange} placeholder="Not detected" />{annotation && <small className="field-ai-hint">{annotation}</small>}</label>;
                })}
                  <label className="extraction-field"><span>Strategy Version<em>OPTIONAL</em></span><select value={strategyVersionId} onChange={(event) => setStrategyVersionId(event.target.value)} disabled={!selectedStrategy}><option value="">Select version</option>{(selectedStrategy?.versions || []).map((version) => <option value={version.id} key={version.id}>v{version.version}</option>)}</select></label>
                </div>
                {selectedVersion && <p className="forward-test-link-note">Counts toward Forward Test of {selectedStrategy.name} v{selectedVersion.version} ({forwardTradeCount} trades so far)</p>}
                <div className="detected-conditions"><p className="eyebrow">DETECTED SETUP CONDITIONS</p>{SETUP_CONDITIONS.map(({ key, label }) => <label key={key}><span>{label}</span><select name={label} value={conditionStates[label]} onChange={handleConditionChange}><option>NOT DETECTED</option><option>CONFIDENT</option><option>LIKELY</option><option>UNCERTAIN</option></select></label>)}</div>
                <div className="detected-conditions indicator-chip-section"><p className="eyebrow">INDICATORS USED</p><div className="checklist-grid">{INDICATORS.map(({ name }) => <label className="check-item" key={name}><input type="checkbox" checked={indicators.includes(name)} onChange={() => handleIndicatorToggle(name)} /><span>{name}</span></label>)}</div></div>
                <label className="form-field screenshot-notes"><span>Notes / context</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context after reviewing the screenshot" rows="3" /></label>
              </div>
            </div>
            <div className="workflow-notice"><strong>Confirm first, save second.</strong><span>Confirming will prefill the existing Trade Form. You will still submit through the existing saveTrade flow.</span></div>
            <div className="form-actions"><button className="cancel-btn" type="button" onClick={handleBack}>Back</button><button className="cancel-btn" type="button" onClick={onClose}>Cancel</button><button className="save-btn" type="button" onClick={handleConfirm}>Confirm and open Trade Form</button></div>
          </>
        )}
      </div>
    </div>
  );
}

export default ScreenshotTradeWorkflow;
