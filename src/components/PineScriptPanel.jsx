import { useState } from "react";
import { generatePine, writePineScriptId } from "../services/pineScript";

export default function PineScriptPanel({ version, scriptId = "", onScriptIdChange = () => {} }) {
  const [result, setResult] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [scriptIdError, setScriptIdError] = useState("");

  function generate() {
    setResult(generatePine(version));
    setCopyMessage("");
  }

  function updateScriptId(event) {
    const nextId = event.target.value;
    if (!writePineScriptId(version?.id, nextId)) {
      setScriptIdError(nextId.trim()
        ? "Script ID must use letters, numbers, underscores, or hyphens (up to 80 characters), and browser storage must be available."
        : "Could not save the script ID in browser storage.");
      return;
    }
    onScriptIdChange(nextId);
    setScriptIdError("");
  }

  async function copy(code) {
    if (!navigator.clipboard?.writeText) {
      setCopyMessage("Clipboard access is unavailable in this browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage("Pine Script copied.");
    } catch (error) {
      setCopyMessage(error instanceof Error ? `Could not copy Pine Script: ${error.message}` : "Could not copy Pine Script.");
    }
  }

  return (
    <section className="trading-workspace-card pine-script-panel">
      <div className="pine-script-panel-heading">
        <div>
          <p className="eyebrow">STRATEGY / TRADINGVIEW</p>
          <h2>Strategy → Pine Script</h2>
          <p>{version ? `${version.name || version.strategyName || "Strategy"} · v${version.version}` : "Choose a strategy version above to generate a script."}</p>
        </div>
        <button type="button" className="add-trade-btn" onClick={generate} disabled={!version}>Generate Pine Script</button>
      </div>

      {version && <div className="pine-script-publish">
        <label htmlFor="tradingview-script-id">TradingView script ID (optional)</label>
        <input
          id="tradingview-script-id"
          value={scriptId}
          onChange={updateScriptId}
          placeholder="Paste a published script ID"
          autoComplete="off"
        />
        <small>Publish the script on TradingView (public) and paste its ID to load it on this chart. May not load in the free embed.</small>
        {scriptIdError && <span role="alert">{scriptIdError}</span>}
      </div>}

      {result && <>
        {result.notIncluded.length > 0 && <div className="pine-script-not-included">
          <strong>Not generated: {result.notIncluded.join(", ")}; check these manually.</strong>
        </div>}
        {result.notes.map((note) => <p className="pine-script-note" key={note}>{note}</p>)}
        {result.scripts.length === 0
          ? <p className="pine-script-empty">No supported indicators or setup conditions are enabled in this version.</p>
          : result.scripts.map((script) => <section className="pine-script-output" key={script.id}>
            <div className="pine-script-output-heading">
              <h3>{script.title}</h3>
              <button type="button" className="secondary-btn" onClick={() => copy(script.code)}>Copy</button>
            </div>
            <pre><code>{script.code}</code></pre>
          </section>)}
        <p className="pine-script-instructions">Open TradingView → Pine Editor → paste → Add to chart.</p>
        <p className="pine-script-note">This script mirrors your indicator settings; setup conditions marked above are approximations. It can&apos;t be tested inside this app — paste it into TradingView and check it compiles.</p>
        <p aria-live="polite" className="pine-script-copy-message">{copyMessage}</p>
      </>}
    </section>
  );
}
