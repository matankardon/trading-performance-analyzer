import { useEffect, useMemo, useRef, useState } from "react";
import { assertTradingViewWidgetConfig } from "../services/tradingViewWidgetConfigs";
import "./TradingViewWidgets.css";

const ALLOWED_WIDGETS = new Set(["ticker-tape", "events", "timeline", "technical-analysis"]);
const IFRAME_GRACE_MS = 1500;
const MAX_LOADING_MS = 8000;

const ATTRIBUTION = {
  "ticker-tape": ["Track all markets on TradingView", "https://www.tradingview.com/"],
  events: ["Economic calendar by TradingView", "https://www.tradingview.com/economic-calendar/"],
  timeline: ["Market news by TradingView", "https://www.tradingview.com/markets/"],
  "technical-analysis": ["Technical analysis by TradingView", "https://www.tradingview.com/"],
};

export default function TradingViewWidget({ scriptName, config, height = 420, title }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [retryKey, setRetryKey] = useState(0);
  const configKeyNames = Object.keys(config || {}).join(",");
  const configResult = useMemo(() => {
    try {
      if (!ALLOWED_WIDGETS.has(scriptName)) throw new TypeError("Unsupported TradingView widget.");
      assertTradingViewWidgetConfig(scriptName, config);
      return { json: JSON.stringify(config), error: null };
    } catch (error) {
      return { json: null, error };
    }
  }, [config, scriptName]);
  const configJson = configResult.json;
  const configError = configResult.error;
  const attribution = ATTRIBUTION[scriptName] || ["TradingView", "https://www.tradingview.com/"];

  useEffect(() => {
    const container = containerRef.current;
    const widget = widgetRef.current;
    if (!container || !widget) return undefined;

    let active = true;
    let iframeGraceTimer = null;
    let maxLoadingTimer = null;
    let observedIframe = null;
    let script = null;
    setStatus("loading");
    widget.replaceChildren();
    container.querySelectorAll(":scope > script").forEach((element) => element.remove());

    const clearTimers = () => {
      if (iframeGraceTimer !== null) window.clearTimeout(iframeGraceTimer);
      if (maxLoadingTimer !== null) window.clearTimeout(maxLoadingTimer);
      iframeGraceTimer = null;
      maxLoadingTimer = null;
    };
    const markLoaded = () => {
      if (!active) return;
      clearTimers();
      setStatus("loaded");
    };
    const observer = new MutationObserver(() => {
      const iframe = widget.querySelector("iframe");
      if (!iframe || iframe === observedIframe) return;
      observedIframe = iframe;
      iframeGraceTimer = window.setTimeout(markLoaded, IFRAME_GRACE_MS);
    });
    observer.observe(widget, { childList: true, subtree: true });

    if (configError || typeof configJson !== "string") {
      console.error("Could not serialize TradingView widget config keys:", configKeyNames.split(",").filter(Boolean));
      queueMicrotask(() => {
        if (active) setStatus("error");
      });
    } else {
      script = document.createElement("script");
      script.type = "text/javascript";
      script.async = true;
      script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${scriptName}.js`;
      script.textContent = configJson;
      script.onerror = () => {
        clearTimers();
        if (active) setStatus("error");
      };
      script.onload = () => {
        const iframe = widget.querySelector("iframe");
        if (iframe && iframe !== observedIframe) {
          observedIframe = iframe;
          iframeGraceTimer = window.setTimeout(markLoaded, IFRAME_GRACE_MS);
        }
      };
      maxLoadingTimer = window.setTimeout(markLoaded, MAX_LOADING_MS);
      container.append(script);
    }

    return () => {
      active = false;
      observer.disconnect();
      clearTimers();
      if (script) {
        script.onerror = null;
        script.onload = null;
        script.remove();
      }
      widget.replaceChildren();
    };
  }, [configError, configJson, configKeyNames, retryKey, scriptName]);

  return (
    <section className="tradingview-widget-shell" style={{ height }} aria-label={title}>
      {status !== "loaded" && <div className="tradingview-widget-loading" role={status === "error" ? "alert" : "status"}>
        {status === "error" ? <>
          <strong>{title || "TradingView widget"} could not be loaded</strong>
          <p>The embed may be blocked by your network, browser policy, or invalid widget configuration.</p>
          <button type="button" className="secondary-btn" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
        </> : `Loading ${title || "TradingView widget"}…`}
      </div>}
      <div ref={containerRef} className="tradingview-widget-container">
        <div ref={widgetRef} className="tradingview-widget-container__widget" />
        <div className="tradingview-widget-copyright">
          <a href={attribution[1]} target="_blank" rel="noopener nofollow">{attribution[0]}</a>
        </div>
      </div>
    </section>
  );
}
