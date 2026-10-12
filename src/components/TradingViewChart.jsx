import { useEffect, useRef, useState } from "react";
import { buildWidgetConfig } from "../services/tradingViewWidgetConfig";

const EMBED_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const EMPTY_STUDIES = [];

export default function TradingViewChart({ symbol, interval, studies = EMPTY_STUDIES }) {
  const host = useRef(null);
  const [status, setStatus] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);
  const studyKey = JSON.stringify(studies);

  useEffect(() => {
    const container = host.current;
    if (!container) return undefined;

    let active = true;
    let frame = null;
    setStatus("loading");
    container.replaceChildren();
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = EMBED_SCRIPT;
    script.async = true;

    const observer = new MutationObserver(() => {
      const iframe = widget.querySelector("iframe");
      if (!iframe || iframe === frame) return;
      frame = iframe;
      iframe.addEventListener("load", () => {
        if (active) setStatus("loaded");
      }, { once: true });
    });
    observer.observe(widget, { childList: true, subtree: true });
    script.onerror = () => {
      queueMicrotask(() => {
        if (active) setStatus("error");
      });
    };
    script.onload = () => {
      const iframe = widget.querySelector("iframe");
      if (iframe && iframe !== frame) {
        frame = iframe;
        iframe.addEventListener("load", () => {
          if (active) setStatus("loaded");
        }, { once: true });
      }
    };

    let serializedConfig;
    try {
      const config = buildWidgetConfig({ symbol, interval, studies });
      serializedConfig = JSON.stringify(config);
      if (typeof serializedConfig !== "string") throw new TypeError("Widget configuration did not serialize to JSON.");
    } catch {
      console.error("Could not serialize TradingView widget config keys:", [
        "symbol",
        "interval",
        "theme",
        "locale",
        "timezone",
        "style",
        "backgroundColor",
        "gridColor",
        "allow_symbol_change",
        "autosize",
        "studies",
        "studies_overrides",
      ]);
      queueMicrotask(() => {
        if (active) setStatus("error");
      });
      return () => {
        active = false;
        observer.disconnect();
        container.replaceChildren();
      };
    }
    script.textContent = serializedConfig;
    container.append(widget, script);

    return () => {
      active = false;
      observer.disconnect();
      script.onerror = null;
      script.onload = null;
      container.replaceChildren();
    };
  }, [interval, retryKey, studyKey, symbol, studies]);

  return (
    <div className="tradingview-chart-shell">
      {status !== "loaded" && <div className="chart-loading-shimmer tradingview-chart-loading" role="status">
        {status === "error" ? <div className="tradingview-chart-error" role="alert">
          <strong>TradingView chart could not be loaded</strong>
          <p>The embed script may be blocked by your network or browser policy.</p>
          <button type="button" className="secondary-btn" onClick={() => setRetryKey((value) => value + 1)}>Retry</button>
        </div> : "Loading TradingView chart…"}
      </div>}
      <div ref={host} className="tradingview-widget-container" aria-label={`TradingView chart for ${symbol}`} />
    </div>
  );
}
