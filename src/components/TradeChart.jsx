import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  LineStyle,
} from "lightweight-charts";
import { formatNewYorkTimestamp } from "../services/sessionWindows";
import { getTradeChartWindow } from "../services/tradeChartData";

const timestampToChartTime = (timestamp) => Math.floor(timestamp / 1000);
const numberText = (value) => Number.isFinite(value) ? value.toFixed(2) : "n/a";

function TradeChart({ bars, trade, asset, onClose }) {
  const hostRef = useRef(null);
  const chartBars = getTradeChartWindow(bars, trade);
  const outcome = trade.pnl > 0 ? "win" : trade.pnl < 0 ? "loss" : "flat";

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !chartBars.length) return undefined;

    const styles = getComputedStyle(document.documentElement);
    const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    const winColor = token("--terminal-green", "#2ecc71");
    const lossColor = token("--terminal-red", "#cf777e");
    const neutralColor = token("--terminal-amber", "#b8860b");
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b131e" },
        textColor: "#aebaca",
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(150, 180, 205, 0.07)" },
        horzLines: { color: "rgba(150, 180, 205, 0.10)" },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      leftPriceScale: { visible: false },
      rightPriceScale: { borderColor: "rgba(150, 180, 205, 0.18)" },
      timeScale: {
        borderColor: "rgba(150, 180, 205, 0.18)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        tickMarkFormatter: (time) => formatNewYorkTimestamp(Number(time) * 1000).slice(0, 16),
      },
      localization: {
        timeFormatter: (time) => formatNewYorkTimestamp(Number(time) * 1000),
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: winColor,
      downColor: lossColor,
      borderUpColor: winColor,
      borderDownColor: lossColor,
      wickUpColor: winColor,
      wickDownColor: lossColor,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candles.setData(chartBars.map((bar) => ({
      time: timestampToChartTime(bar.timestamp),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })));

    candles.createPriceLine({ price: trade.stopLoss, color: lossColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" });
    candles.createPriceLine({ price: trade.takeProfit, color: winColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP" });

    const reasoning = trade.entryReasoning;
    const markers = [
      {
        time: timestampToChartTime(trade.entryTimestamp),
        position: trade.direction === "long" ? "belowBar" : "aboveBar",
        color: winColor,
        shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
        text: "Entry",
      },
      {
        time: timestampToChartTime(trade.exitTimestamp),
        position: trade.direction === "long" ? "aboveBar" : "belowBar",
        color: outcome === "win" ? winColor : outcome === "loss" ? lossColor : neutralColor,
        shape: "circle",
        text: trade.exitReason === "stop_loss" ? "SL exit" : trade.exitReason === "take_profit" ? "TP exit" : "EOD",
      },
    ];
    if (reasoning?.liquiditySweep) {
      markers.push({
        time: timestampToChartTime(reasoning.liquiditySweep.timestamp),
        position: reasoning.liquiditySweep.type === "low" ? "belowBar" : "aboveBar",
        color: neutralColor,
        shape: "circle",
        text: `Sweep ${numberText(reasoning.liquiditySweep.sweptLevel)}`,
      });
    }
    createSeriesMarkers(candles, markers);

    const overlay = host.querySelector(".trade-chart-annotations");
    const drawAnnotations = () => {
      if (!overlay) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
      overlay.replaceChildren();
      if (!reasoning) return;

      const add = (tag, attrs, text) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, String(value)));
        if (text) element.textContent = text;
        overlay.appendChild(element);
      };
      const xAt = (barIndex) => {
        const sourceBar = bars[barIndex];
        return sourceBar ? chart.timeScale().timeToCoordinate(timestampToChartTime(sourceBar.timestamp)) : null;
      };
      const yAt = (price) => candles.priceToCoordinate(price);
      const entryX = xAt(trade.entryIndex);

      reasoning.zones?.forEach((zone) => {
        const x1 = xAt(zone.index);
        const x2 = xAt(reasoning.signalIndex);
        const y1 = yAt(zone.top);
        const y2 = yAt(zone.bottom);
        if ([x1, x2, y1, y2].some((value) => value === null)) return;
        const zoneColor = zone.kind === "FVG" ? "#65c4c4" : "#d9b765";
        add("rect", {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.max(3, Math.abs(x2 - x1)),
          height: Math.max(2, Math.abs(y2 - y1)),
          fill: zoneColor,
          "fill-opacity": 0.12,
          stroke: zoneColor,
          "stroke-opacity": 0.65,
          "stroke-dasharray": "4 3",
        });
        add("text", { x: Math.min(x1, x2) + 4, y: Math.min(y1, y2) - 4, fill: zoneColor, "font-size": 9 }, zone.kind);
      });

      if (reasoning.mss && entryX !== null) {
        const mssX = xAt(reasoning.mss.index);
        const mssY = yAt(reasoning.mss.brokenLevel);
        if (mssX !== null && mssY !== null) {
          add("line", { x1: mssX, x2: entryX, y1: mssY, y2: mssY, stroke: "#d9b765", "stroke-width": 1.5, "stroke-dasharray": "5 3" });
          add("text", { x: mssX + 3, y: mssY - 4, fill: "#d9b765", "font-size": 9 }, `MSS ${numberText(reasoning.mss.brokenLevel)}`);
        }
      }

      if (reasoning.stochastic && entryX !== null) {
        const entryY = yAt(trade.entryPrice);
        if (entryY !== null) {
          add("text", { x: entryX + 8, y: entryY - 12, fill: "#e5e9ef", "font-size": 9 }, `%K ${numberText(reasoning.stochastic.k)} / %D ${numberText(reasoning.stochastic.d)}`);
        }
      }
    };

    chart.timeScale().fitContent();
    drawAnnotations();
    chart.timeScale().subscribeVisibleLogicalRangeChange(drawAnnotations);
    chart.timeScale().subscribeSizeChange(drawAnnotations);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(drawAnnotations);
      chart.timeScale().unsubscribeSizeChange(drawAnnotations);
      chart.remove();
    };
  }, [bars, chartBars, outcome, trade]);

  if (!chartBars.length) {
    return <div className={`trade-chart-panel outcome-${outcome}`}><p>Price bars are unavailable for this trade.</p><button type="button" className="trade-chart-close" onClick={onClose}>Close</button></div>;
  }

  return (
    <section className={`trade-chart-panel outcome-${outcome}`} aria-label={`${asset} trade chart`}>
      <header className="trade-chart-heading">
        <div><p className="eyebrow">TRADE ON CHART</p><h4>{asset} · {trade.direction} · {formatNewYorkTimestamp(trade.entryTimestamp)}</h4></div>
        <button type="button" className="trade-chart-close" onClick={onClose}>Close</button>
      </header>
      <p className="trade-chart-controls-hint">Drag to pan · Scroll or pinch to zoom</p>
      <div className="trade-chart-canvas" ref={hostRef}>
        <svg className="trade-chart-annotations" aria-hidden="true" />
      </div>
      {reasoningSummary(trade.entryReasoning)}
    </section>
  );
}

function reasoningSummary(reasoning) {
  if (!reasoning) return <p className="trade-chart-reasoning-unavailable">Entry reasoning was not captured for this trade.</p>;
  const parts = [];
  if (reasoning.liquiditySweep) parts.push(`${reasoning.liquiditySweep.type} sweep at ${numberText(reasoning.liquiditySweep.sweptLevel)}`);
  if (reasoning.mss) parts.push(`${reasoning.mss.type} MSS at ${numberText(reasoning.mss.brokenLevel)}`);
  if (reasoning.zones?.length) parts.push(`retested ${reasoning.zones.map(({ kind }) => kind).join(" + ")}`);
  if (reasoning.stochastic) parts.push(`entry-bar stochastic %K ${numberText(reasoning.stochastic.k)} / %D ${numberText(reasoning.stochastic.d)}`);
  return <p className="trade-chart-reasoning">{parts.length ? parts.join(" · ") : "No enabled ICT entry annotations were captured."}</p>;
}

export default TradeChart;
