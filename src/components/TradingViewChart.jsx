import { useEffect, useRef, useState } from "react";
import { buildWidgetConfig } from "../services/tradingViewWidgetConfig";

const EMBED_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const EMPTY_STUDIES = [];
const IFRAME_GRACE_MS = 1500;
const MAX_LOADING_MS = 8000;

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
    let frameGraceTimer = null;
    let maxLoadingTimer = null;
    setStatus("loading");
    container.replaceChildren();
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.width = "100%";
    widget.style.height = "100%";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = EMBED_SCRIPT;
    script.async = true;

    const markLoaded = () => {
      if (!active) return;
      if (frameGraceTimer !== null) window.clearTimeout(frameGraceTimer);
      if (maxLoadingTimer !== null) window.clearTimeout(maxLoadingTimer);
      frameGraceTimer = null;
      maxLoadingTimer = null;
      setStatus("loaded");
    };
    const observeFrame = () => {
      const iframe = widget.querySelector("iframe");
      if (!iframe || iframe === frame) return;
      frame = iframe;
      if (frameGraceTimer !== null) window.clearTimeout(frameGraceTimer);
      frameGraceTimer = window.setTimeout(markLoaded, IFRAME_GRACE_MS);
    };
    const observer = new MutationObserver(observeFrame);
    observer.observe(widget, { childList: true, subtree: true });
    script.onerror = () => {
      if (frameGraceTimer !== null) window.clearTimeout(frameGraceTimer);
      if (maxLoadingTimer !== null) window.clearTimeout(maxLoadingTimer);
      frameGraceTimer = null;
      maxLoadingTimer = null;
      queueMicrotask(() => {
        if (active) setStatus("error");
      });
    };
    script.onload = () => {
      observeFrame();
    };

    let serializedConfig;
    try {
      const config = buildWidgetConfig({ symbol, interval, studies });
      serializedConfig = JSON.stringify(config);
      if (typeof serializedConfig !== "string") throw new TypeError("Widget configuration did not serialize to JSON.");
      console.debug("TradingView widget config JSON:", serializedConfig);
    } catch {
      console.error("Could not serialize TradingView widget config keys:", [
        "symbol",
        "interval",
        "theme",
        "colorTheme",
        "locale",
        "timezone",
        "style",
        "backgroundColor",
        "gridColor",
        "allow_symbol_change",
        "autosize",
        "width",
        "height",
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
    maxLoadingTimer = window.setTimeout(markLoaded, MAX_LOADING_MS);
    container.append(widget, script);

    return () => {
      active = false;
      observer.disconnect();
      if (frameGraceTimer !== null) window.clearTimeout(frameGraceTimer);
      if (maxLoadingTimer !== null) window.clearTimeout(maxLoadingTimer);
      script.onerror = null;
      script.onload = null;
      container.replaceChildren();
    };
  }, [interval, retryKey, studyKey, symbol, studies]);

  return (
    <div className="tradingview-chart-shell" style={{ height: "var(--tradingview-chart-height)" }}>
      {status !== "loaded" && <div className="chart-loading-shimmer tradingview-chart-loading" role="status">
        {status === "error" ? <div className="tradingview-chart-error" role="alert">
          <strong>TradingView chart could not be loaded</strong>
          <p>The embed script may be blocked by your network or browser policy.</p>
          <button type="button" className="secondary-btn" onClick={() => setRetryKey((value) => value + 1)}>Retry</button>
        </div> : "Loading TradingView chart…"}
      </div>}
      <div ref={host} className="tradingview-widget-container" style={{ width: "100%", height: "100%" }} aria-label={`TradingView chart for ${symbol}`} />
    </div>
  );
}
