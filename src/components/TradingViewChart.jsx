import { useEffect, useRef, useState } from "react";

const EMBED_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const EMPTY_STUDIES = [];
const STUDY_TITLES = {
  "MASimple@tv-basicstudies": "moving average",
  "MAExp@tv-basicstudies": "moving average exponential",
  "RSI@tv-basicstudies": "relative strength index",
  "MACD@tv-basicstudies": "macd",
  "BB@tv-basicstudies": "bollinger bands",
  "ADX@tv-basicstudies": "average directional index",
  "IchimokuCloud@tv-basicstudies": "ichimoku cloud",
  "StdDev@tv-basicstudies": "standard deviation",
};

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
      if (active) setStatus("error");
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

    const config = {
      symbol,
      interval,
      theme: "dark",
      locale: "en",
      timezone: "Etc/UTC",
      style: "1",
      backgroundColor: "#0D0D0D",
      gridColor: "rgba(212, 175, 55, 0.08)",
      allow_symbol_change: true,
      autosize: true,
      studies: studies.filter(({ applied }) => applied).map(({ id }) => id),
      studies_overrides: studies.filter(({ applied }) => applied).reduce((overrides, study) => {
        Object.entries(study.inputs).forEach(([input, value]) => {
          overrides[`${STUDY_TITLES[study.id]}.${input}`] = value;
        });
        return overrides;
      }, {}),
    };
    script.textContent = JSON.stringify(config);
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
