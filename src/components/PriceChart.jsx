import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from "lightweight-charts";
import { priceLinesForTrade } from "../services/chartOverlay";
import "./PriceChart.css";

const COLORS = {
  gold: "#d4af37",
  green: "#78c995",
  red: "#df858d",
  teal: "#67c4c2",
  blue: "#8eb8e3",
  purple: "#b6a0e8",
};
const EMPTY_BARS = Object.freeze([]);
const EMPTY_INDICATOR_COMPUTATIONS = Object.freeze([]);
const unixTime = (timestamp) => Math.floor(timestamp / 1000);

function finite(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointsForValues(bars, values, key = "") {
  return values.flatMap((value, index) => {
    const number = value && typeof value === "object" ? value[key] : value;
    return Number.isFinite(number) && Number.isFinite(bars[index]?.timestamp)
      ? [{ time: unixTime(bars[index].timestamp), value: number }]
      : [];
  });
}

export default function PriceChart({
  bars = EMPTY_BARS,
  trade,
  indicatorComputations = EMPTY_INDICATOR_COMPUTATIONS,
  height = 360,
}) {
  const chartHost = useRef(null);
  const lowerHosts = useRef(new Map());
  const [zones, setZones] = useState([]);
  const lowerIndicators = useMemo(
    () => indicatorComputations.filter(({ output }) => output?.pane === "lower"),
    [indicatorComputations],
  );
  const chartTrade = useMemo(() => ({
    entry: trade?.entry,
    exit: trade?.exit,
    stopLoss: trade?.stopLoss,
    stop_loss: trade?.stop_loss,
    takeProfit: trade?.takeProfit,
    take_profit: trade?.take_profit,
    pnl: trade?.pnl,
    direction: trade?.direction,
    entryTimestamp: trade?.entryTimestamp,
  }), [
    trade?.direction,
    trade?.entry,
    trade?.entryTimestamp,
    trade?.exit,
    trade?.pnl,
    trade?.stopLoss,
    trade?.stop_loss,
    trade?.takeProfit,
    trade?.take_profit,
  ]);

  useEffect(() => {
    const host = chartHost.current;
    if (!host || !bars.length) return undefined;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b131e" },
        textColor: "#aebaca",
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
        fontSize: 10,
      },
      grid: { vertLines: { color: "rgba(150,180,205,.07)" }, horzLines: { color: "rgba(150,180,205,.1)" } },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: { pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false, mouseWheel: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      rightPriceScale: { borderColor: "rgba(150,180,205,.18)", autoScale: true },
      timeScale: { borderColor: "rgba(150,180,205,.18)", timeVisible: true, secondsVisible: false, rightOffset: 4 },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.green,
      downColor: COLORS.red,
      borderUpColor: COLORS.green,
      borderDownColor: COLORS.red,
      wickUpColor: COLORS.green,
      wickDownColor: COLORS.red,
      priceLineVisible: true,
    });
    candles.setData(bars.map((bar) => ({
      time: unixTime(bar.timestamp),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })));

    if (bars.some((bar) => Number.isFinite(bar.volume))) {
      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      volume.setData(bars.filter((bar) => Number.isFinite(bar.volume)).map((bar) => ({
        time: unixTime(bar.timestamp),
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(120,201,149,.32)" : "rgba(223,133,141,.32)",
      })));
    }

    const entry = finite(chartTrade.entry);
    const entryTimestamp = chartTrade.entryTimestamp;
    const entryBar = Number.isFinite(entryTimestamp)
      ? bars.reduce((nearest, bar) => Math.abs(bar.timestamp - entryTimestamp) < Math.abs(nearest.timestamp - entryTimestamp) ? bar : nearest, bars[0])
      : null;
    const pnl = finite(chartTrade.pnl);
    const markerColor = pnl === null || pnl === 0 ? COLORS.gold : pnl > 0 ? COLORS.green : COLORS.red;
    const isLong = String(chartTrade.direction || "").toLowerCase() === "long";
    createSeriesMarkers(candles, entryBar && entry !== null ? [{
      time: unixTime(entryBar.timestamp),
      position: isLong ? "belowBar" : "aboveBar",
      color: markerColor,
      shape: isLong ? "arrowUp" : "arrowDown",
      text: "Entry",
    }] : []);

    const levels = [
      { value: entry, label: "Entry", color: COLORS.gold },
      { value: finite(chartTrade.exit), label: "Exit", color: COLORS.blue },
      ...priceLinesForTrade(chartTrade).map(({ price, label, color }) => ({ value: price, label, color })),
    ];
    levels.filter(({ value }) => value !== null).forEach(({ value, label, color }) => {
      candles.createPriceLine({
        price: value,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: label,
      });
    });
    const entryCoordinate = entry === null ? null : candles.priceToCoordinate?.(entry);
    const nextZones = [
      { value: finite(chartTrade.stopLoss ?? chartTrade.stop_loss), color: "rgba(223,133,141,.12)" },
      { value: finite(chartTrade.takeProfit ?? chartTrade.take_profit), color: "rgba(120,201,149,.12)" },
    ].flatMap(({ value, color }) => {
      if (value === null || entryCoordinate === null || entryCoordinate === undefined) return [];
      const otherCoordinate = candles.priceToCoordinate?.(value);
      if (!Number.isFinite(otherCoordinate)) return [];
      const top = Math.min(entryCoordinate, otherCoordinate);
      return [{ top, height: Math.max(1, Math.abs(entryCoordinate - otherCoordinate)), color }];
    });
    setZones(nextZones);

    indicatorComputations.forEach(({ item, output }) => {
      if (!output || output.pane !== "price") return;
      const addLine = (key, color) => {
        const line = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `${item.name} ${key}`.trim(),
        });
        line.setData(pointsForValues(bars, output.values, key));
      };
      if (["SMA", "EMA"].includes(item.name)) addLine("", item.name === "SMA" ? COLORS.gold : COLORS.blue);
      if (item.name === "Bollinger") {
        ["upper", "middle", "lower"].forEach((key) => addLine(key, key === "middle" ? COLORS.gold : COLORS.teal));
      }
      if (item.name === "Ichimoku") {
        ["conversionLine", "baseLine", "spanA", "spanB"].forEach((key, index) => {
          addLine(key, [COLORS.gold, COLORS.blue, COLORS.green, COLORS.purple][index]);
        });
      }
    });

    const lowerCharts = [];
    lowerIndicators.forEach(({ item, output }) => {
      const lowerHost = lowerHosts.current.get(item.key);
      if (!lowerHost) return;
      const lowerChart = createChart(lowerHost, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "#0b131e" }, textColor: "#aebaca", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: 9 },
        grid: { vertLines: { color: "rgba(150,180,205,.05)" }, horzLines: { color: "rgba(150,180,205,.08)" } },
        rightPriceScale: { borderColor: "rgba(150,180,205,.18)" },
        timeScale: { visible: false, rightOffset: 4 },
      });
      lowerCharts.push(lowerChart);
      const addLine = (key, color) => {
        const line = lowerChart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `${item.name} ${key}`.trim(),
        });
        line.setData(pointsForValues(bars, output.values, key));
      };
      if (item.name === "MACD") {
        addLine("macd", COLORS.gold);
        addLine("signal", COLORS.blue);
      } else if (item.name === "Stochastic") {
        addLine("k", COLORS.gold);
        addLine("d", COLORS.blue);
      } else addLine("", item.name === "RSI" ? COLORS.purple : COLORS.teal);
      lowerChart.timeScale().fitContent();
    });

    chart.timeScale().fitContent();
    return () => {
      setZones([]);
      lowerCharts.forEach((lowerChart) => lowerChart.remove());
      chart.remove();
    };
  }, [bars, chartTrade, indicatorComputations, lowerIndicators]);

  return (
    <div className="price-chart-stack">
      <div className="price-chart-stage" style={{ height }}>
        <div className="price-chart-canvas" ref={chartHost} aria-label="Trade historical price chart" />
        {zones.map((zone, index) => <div
          className="price-chart-risk-zone"
          key={`zone-${index}`}
          style={{ top: zone.top, height: zone.height, background: zone.color }}
        />)}
      </div>
      {lowerIndicators.map(({ item }) => (
        <div className="price-chart-indicator-pane" key={item.key}>
          <span>{item.label}</span>
          <div ref={(node) => {
            if (node) lowerHosts.current.set(item.key, node);
            else lowerHosts.current.delete(item.key);
          }} />
        </div>
      ))}
    </div>
  );
}
