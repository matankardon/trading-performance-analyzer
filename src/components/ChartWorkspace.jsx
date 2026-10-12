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
import { supportedHistoricalTimeframes } from "../../supabase/functions/_shared/timeframe";
import { INDICATORS, SETUP_CONDITIONS } from "../constants/strategyOptions";
import { fetchHistoricalBars, historicalAssetSuggestions } from "../services/historicalDataService";
import { priceLinesForTrade, tradesToMarkers } from "../services/chartOverlay";
import { readSymbolMap, resolveChartSymbol, toTradingViewSymbol, writeSymbolMap } from "../services/symbolMap";
import { studiesForVersion } from "../services/tradingViewStudies";
import TradingViewChart from "./TradingViewChart";
import TradePlanPanel from "./TradePlanPanel";
import {
  calculateADX,
  calculateBollingerBands,
  calculateEMA,
  calculateFibonacciLevels,
  calculateIchimoku,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateStdDev,
} from "../services/indicators";
import { calculateStochastic } from "../services/stochastic";
import {
  copySetupSnapshot,
  downloadSetupSnapshot,
  normalizeSetupSnapshot,
} from "../services/setupSnapshot";
import "./TradingWorkspaces.css";

const STORAGE_KEY = "tradeCatalystChartSelection";
const VIEW_STORAGE_KEY = "tradeCatalystChartView";
const CHECKLIST_STORAGE_KEY = "tradeCatalystSetupChecklist";
const SUPPORTED_TIMEFRAMES = supportedHistoricalTimeframes.map(({ value }) => value);
const TIMEFRAME_LABELS = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1W" };
const TRADINGVIEW_INTERVALS = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1w": "W" };
const RANGE_DAYS = { "1W": 7, "1M": 30, "3M": 90, "6M": 180 };
const EMPTY_BARS = [];
const CHART_COLORS = {
  gold: "#d4af37",
  green: "#78c995",
  red: "#df858d",
  teal: "#67c4c2",
  blue: "#8eb8e3",
  purple: "#b6a0e8",
};
const unixTime = (timestamp) => Math.floor(timestamp / 1000);
const storedDate = (value) => String(value ?? "").slice(0, 10);
const formatPnl = (value) => Number.isFinite(value)
  ? `${value >= 0 ? "+" : "-"}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : "P&L not recorded";

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hasValidTradeDate(trade) {
  const date = storedDate(trade?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function dateRange(preset) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - RANGE_DAYS[preset] + 1);
  return { startDate: localDate(start), endDate: localDate(end) };
}

function readSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      symbol: typeof value.symbol === "string" ? value.symbol.toUpperCase() : "",
      timeframe: typeof value.timeframe === "string" ? value.timeframe : "1d",
    };
  } catch {
    return { symbol: "", timeframe: "1d" };
  }
}

function writeSelection(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The chart remains usable when browser storage is unavailable.
  }
}

function readChartView() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "my-trades" ? "my-trades" : "tradingview";
  } catch {
    return "tradingview";
  }
}

function writeChartView(view) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // View selection remains available for the current session.
  }
}

function readSetupChecklist() {
  try {
    const stored = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function indicatorSpecs(version) {
  const conditions = version?.conditions || {};
  const settings = conditions.indicatorSettings || {};
  return INDICATORS.filter(({ key }) => conditions[key]).map((item) => ({
    ...item,
    settings: settings[item.key] || {},
  }));
}

function declaredConditions(version) {
  const conditions = version?.conditions || {};
  return [
    ...SETUP_CONDITIONS.map((item) => ({ ...item, type: "Condition" })),
    ...INDICATORS.map((item) => ({ ...item, type: "Indicator" })),
  ].filter(({ key }) => conditions[key]);
}

function calculateIndicator(item, bars) {
  const settings = item.settings;
  switch (item.name) {
    case "SMA":
      return { pane: "price", values: calculateSMA(bars, Number(settings.period) || 20) };
    case "EMA":
      return { pane: "price", values: calculateEMA(bars, Number(settings.period) || 20) };
    case "Bollinger":
      return { pane: "price", values: calculateBollingerBands(bars, Number(settings.period) || 20, Number(settings.stdDevMultiplier) || 2) };
    case "RSI":
      return { pane: "lower", values: calculateRSI(bars, Number(settings.period) || 14) };
    case "MACD":
      return { pane: "lower", values: calculateMACD(bars, Number(settings.fastPeriod) || 12, Number(settings.slowPeriod) || 26, Number(settings.signalPeriod) || 9) };
    case "ADX":
      return { pane: "lower", values: calculateADX(bars, Number(settings.period) || 14) };
    case "Fibonacci":
      return { pane: "price", values: calculateFibonacciLevels(bars, Number(settings.lookback) || 50) };
    case "Ichimoku":
      return { pane: "price", values: calculateIchimoku(bars, Number(settings.conversionPeriod) || 9, Number(settings.basePeriod) || 26, Number(settings.spanBPeriod) || 52) };
    case "StdDev":
      return { pane: "lower", values: calculateStdDev(bars, Number(settings.period) || 20) };
    case "Stochastic":
      return { pane: "lower", values: calculateStochastic(bars, Number(settings.kPeriod) || 14, Number(settings.dPeriod) || 3) };
    default:
      return null;
  }
}

function pointsForValues(bars, values, key) {
  return values.flatMap((value, index) => {
    const number = typeof value === "object" && value !== null ? value[key] : value;
    return Number.isFinite(number) && Number.isFinite(bars[index]?.timestamp)
      ? [{ time: unixTime(bars[index].timestamp), value: number }]
      : [];
  });
}

function makeSetupSnapshot(symbol, timeframe, trades, version, plan = {}, checked = {}) {
  return normalizeSetupSnapshot({
    symbol,
    timeframe,
    timestamp: new Date().toISOString(),
    direction: plan.direction,
    entryZone: plan.entry === "" ? undefined : Number(plan.entry),
    stopZone: plan.stopLoss === "" ? undefined : Number(plan.stopLoss),
    takeProfitZone: plan.takeProfit === "" ? undefined : Number(plan.takeProfit),
    riskReward: plan.riskReward,
    setupConditions: Object.entries(version?.conditions || {}).filter(([key, value]) => (
      key !== "indicatorSettings" && value === true
    )).map(([key]) => key).concat(Object.entries(checked).filter(([, value]) => value).map(([key]) => key)),
    journaledTrades: trades.map((trade) => Object.fromEntries(Object.entries({
      date: trade.date,
      direction: trade.direction,
      entry: finite(trade.entry),
      exit: finite(trade.exit),
      stopLoss: finite(trade.stopLoss),
      takeProfit: finite(trade.takeProfit),
      pnl: finite(trade.pnl),
      strategy: trade.strategy,
      version: trade.versionNumber,
    }).filter(([, value]) => value !== null && value !== undefined && value !== ""))),
  });
}

function ChartCanvas({ bars, trades, showTrades, focusTradeDate, indicatorComputations, onViewTrade, onCrosshair }) {
  const chartHost = useRef(null);
  const indicatorHosts = useRef(new Map());
  const savedRange = useRef({ key: "", range: null });
  const lowerIndicators = useMemo(
    () => indicatorComputations.filter(({ output }) => output?.pane === "lower"),
    [indicatorComputations],
  );
  const dataRangeKey = `${bars[0]?.timestamp ?? ""}:${bars[bars.length - 1]?.timestamp ?? ""}`;

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
      upColor: CHART_COLORS.green,
      downColor: CHART_COLORS.red,
      borderUpColor: CHART_COLORS.green,
      borderDownColor: CHART_COLORS.red,
      wickUpColor: CHART_COLORS.green,
      wickDownColor: CHART_COLORS.red,
      priceLineVisible: true,
    });
    candles.setData(bars.map((bar) => ({
      time: unixTime(bar.timestamp),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })));
    const timesByDate = new Map();
    bars.forEach((bar) => {
      const date = new Date(bar.timestamp).toISOString().slice(0, 10);
      const time = unixTime(bar.timestamp);
      if (!timesByDate.has(date)) timesByDate.set(date, [time, time]);
      else timesByDate.get(date)[1] = time;
    });
    const chartTimeForDate = (date, last = false) => timesByDate.get(date)?.[last ? 1 : 0] ?? null;
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

    const markerTrades = showTrades ? tradesToMarkers(trades, trades[0]?.asset, {}) : { markers: [], trades: [] };
    const chartMarkers = markerTrades.markers.flatMap((marker) => {
      const time = chartTimeForDate(marker.date, marker.type === "exit");
      if (time === null) return [];
      return [{
        time,
        position: marker.position,
        color: marker.color,
        shape: marker.shape,
        text: marker.type === "entry" ? "Entry" : "Exit",
        id: marker.tradeId ? `${marker.tradeId}:${marker.type}` : undefined,
      }];
    });
    createSeriesMarkers(candles, chartMarkers);

    if (showTrades) {
      markerTrades.trades.forEach((trade) => {
        const date = storedDate(trade.date);
        const entryTime = chartTimeForDate(date);
        const exitTime = chartTimeForDate(date, true);
        if (entryTime !== null) priceLinesForTrade(trade).forEach(({ price, label, color }) => {
          candles.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: label,
          });
        });
        if (entryTime === null || exitTime === null || entryTime === exitTime) return;
        const line = chart.addSeries(LineSeries, {
          color: (finite(trade.pnl) ?? 0) >= 0 ? CHART_COLORS.green : CHART_COLORS.red,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        line.setData([
          { time: entryTime, value: finite(trade.entry) },
          { time: exitTime, value: finite(trade.exit) },
        ]);
      });
    }

    indicatorComputations.forEach(({ item, output }) => {
      if (!output || output.pane !== "price") return;
      const addLine = (key, color) => {
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `${item.name} ${key}`,
        });
        series.setData(pointsForValues(bars, output.values, key));
      };
      if (["SMA", "EMA"].includes(item.name)) addLine("", item.name === "SMA" ? CHART_COLORS.gold : CHART_COLORS.blue);
      if (item.name === "Bollinger") {
        ["upper", "middle", "lower"].forEach((key) => addLine(key, key === "middle" ? CHART_COLORS.gold : CHART_COLORS.teal));
      }
      if (item.name === "Fibonacci") {
        ["0.236", "0.382", "0.5", "0.618", "0.786"].forEach((ratio, index) => {
          const series = chart.addSeries(LineSeries, {
            color: index === 2 ? CHART_COLORS.gold : "rgba(142,184,227,.65)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          series.setData(output.values.flatMap((value, barIndex) => (
            value && Number.isFinite(value.levels[ratio])
              ? [{ time: unixTime(bars[barIndex].timestamp), value: value.levels[ratio] }]
              : []
          )));
        });
      }
      if (item.name === "Ichimoku") {
        ["conversionLine", "baseLine", "spanA", "spanB"].forEach((key, index) => {
          addLine(key, [CHART_COLORS.gold, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.purple][index]);
        });
      }
    });

    const lowerCharts = [];
    lowerIndicators.forEach(({ item, output }) => {
      const indicatorHost = indicatorHosts.current.get(item.key);
      if (!indicatorHost) return;
      const lowerChart = createChart(indicatorHost, {
          autoSize: true,
          layout: { background: { type: ColorType.Solid, color: "#0b131e" }, textColor: "#aebaca", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontSize: 9 },
          grid: { vertLines: { color: "rgba(150,180,205,.05)" }, horzLines: { color: "rgba(150,180,205,.08)" } },
          rightPriceScale: { borderColor: "rgba(150,180,205,.18)" },
          timeScale: { visible: false, rightOffset: 4 },
      });
      lowerCharts.push(lowerChart);
      const addLowerLine = (key, color) => {
        const series = lowerChart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title: `${item.name} ${key}`.trim(),
        });
        series.setData(pointsForValues(bars, output.values, key));
      };
      if (item.name === "MACD") {
        addLowerLine("macd", CHART_COLORS.gold);
        addLowerLine("signal", CHART_COLORS.blue);
      } else if (item.name === "Stochastic") {
        addLowerLine("k", CHART_COLORS.gold);
        addLowerLine("d", CHART_COLORS.blue);
      } else {
        addLowerLine("", item.name === "RSI" ? CHART_COLORS.purple : CHART_COLORS.teal);
      }
      lowerChart.timeScale().fitContent();
    });
    const timeScale = chart.timeScale();
    const focusIndex = focusTradeDate
      ? bars.findIndex((bar) => new Date(bar.timestamp).toISOString().slice(0, 10) === focusTradeDate)
      : -1;
    if (focusIndex >= 0) {
      timeScale.setVisibleLogicalRange({
        from: Math.max(-1, focusIndex - 15),
        to: Math.min(bars.length, focusIndex + 15),
      });
    } else if (savedRange.current.key === dataRangeKey && savedRange.current.range) {
      timeScale.setVisibleLogicalRange(savedRange.current.range);
    } else {
      timeScale.fitContent();
    }

    const onCrosshairMove = (parameter) => {
      if (!parameter?.time) return onCrosshair(null);
      const candle = parameter.seriesData?.get(candles);
      const time = typeof parameter.time === "number" ? parameter.time * 1000 : null;
      const date = time ? new Date(time).toISOString().slice(0, 10) : "";
      const trade = markerTrades.trades.find((entry) => storedDate(entry.date) === date);
      onCrosshair(candle ? { ...candle, time: parameter.time, date, trade } : null);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);
    const onClick = (parameter) => {
      if (!parameter?.time) return;
      const hoveredObjectId = String(parameter.hoveredObjectId ?? "");
      const markerTradeId = hoveredObjectId.includes(":") ? hoveredObjectId.slice(0, hoveredObjectId.lastIndexOf(":")) : "";
      const markerTrade = markerTradeId
        ? markerTrades.trades.find((entry) => String(entry.id) === markerTradeId)
        : null;
      if (markerTrade) {
        onViewTrade(markerTrade.originalTrade || markerTrade);
        return;
      }
      const timestamp = typeof parameter.time === "number" ? parameter.time * 1000 : null;
      if (!timestamp) return;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const trade = markerTrades.trades.find((entry) => storedDate(entry.date) === date);
      if (trade) onViewTrade(trade.originalTrade || trade);
    };
    chart.subscribeClick(onClick);

    return () => {
      if (savedRange.current.key === dataRangeKey) {
        savedRange.current.range = timeScale.getVisibleLogicalRange() || savedRange.current.range;
      } else {
        savedRange.current = { key: dataRangeKey, range: timeScale.getVisibleLogicalRange() };
      }
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.unsubscribeClick(onClick);
      lowerCharts.forEach((lowerChart) => lowerChart.remove());
      chart.remove();
    };
  }, [bars, dataRangeKey, focusTradeDate, indicatorComputations, lowerIndicators, onCrosshair, onViewTrade, showTrades, trades]);

  return (
    <>
      <div className="trading-chart-canvas" ref={chartHost} aria-label="Historical candlestick chart" />
      {lowerIndicators.map((item) => <div className="trading-indicator-pane" key={item.key}><div className="trading-indicator-pane-label">{item.label}</div><div className="trading-indicator-pane-chart" ref={(node) => {
        if (node) indicatorHosts.current.set(item.key, node);
        else indicatorHosts.current.delete(item.key);
      }} /></div>)}
    </>
  );
}

function SetupExport({ symbol, timeframe, trades, strategyVersion, plan, checked }) {
  const [message, setMessage] = useState("");
  const snapshot = makeSetupSnapshot(symbol, timeframe, trades, strategyVersion, plan, checked);
  async function copy() {
    const copied = await copySetupSnapshot(snapshot);
    setMessage(copied ? "Setup snapshot copied." : "Clipboard unavailable; export the snapshot instead.");
  }
  function download() {
    downloadSetupSnapshot(snapshot);
    setMessage("Setup snapshot exported.");
  }
  return (
    <section className="trading-workspace-card setup-export-panel">
      <div><p className="eyebrow">CHART / SETUP</p><h2>Carry the plan to TradingView</h2><p>Export the selected market, strategy conditions, and journaled levels for manual review.</p></div>
      <div className="setup-export-actions"><button type="button" className="secondary-btn" onClick={copy}>Copy setup snapshot</button><button type="button" className="add-trade-btn" onClick={download}>Export to TradingView</button></div>
      <small>{message || "Only available values are included."}</small>
    </section>
  );
}

export default function ChartWorkspace({
  trades = [],
  strategyLibrary = [],
  selectedAsset = "",
  onAssetChange = () => {},
  onViewTrade = () => {},
  onLogTrade = () => {},
}) {
  const [symbolMap, setSymbolMap] = useState(() => readSymbolMap());
  const [initial] = useState(() => readSelection());
  const [assetInput, setAssetInput] = useState(() => selectedAsset || initial.symbol || "");
  const [symbol, setSymbol] = useState(() => {
    const fallback = selectedAsset || initial.symbol || "";
    return resolveChartSymbol(fallback, symbolMap) || fallback.toUpperCase();
  });
  const [timeframe, setTimeframe] = useState(initial.timeframe);
  const [view, setView] = useState(readChartView);
  const [range, setRange] = useState("3M");
  const [requestState, setRequestState] = useState({ key: "", bars: [], error: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTrades, setShowTrades] = useState(true);
  const [strategyId, setStrategyId] = useState(strategyLibrary[0]?.id || "");
  const [strategyVersionChoice, setStrategyVersionChoice] = useState();
  const [setupChecklist, setSetupChecklist] = useState(readSetupChecklist);
  const [planValues, setPlanValues] = useState({});
  const [crosshair, setCrosshair] = useState(null);
  const [focusTradeDate, setFocusTradeDate] = useState("");
  const [pendingMapValue, setPendingMapValue] = useState("");
  const [tradesExpanded, setTradesExpanded] = useState(false);
  const tradeDropdown = useRef(null);
  const requestId = useRef(0);
  const selectedStrategy = strategyLibrary.find(({ id }) => id === strategyId) || strategyLibrary[0] || null;
  const strategyVersions = useMemo(
    () => [...(selectedStrategy?.versions || [])].sort((left, right) => Number(right.version) - Number(left.version)),
    [selectedStrategy],
  );
  const strategyVersionId = strategyVersionChoice === undefined
    ? strategyVersions[0]?.id || ""
    : strategyVersionChoice || "";
  const journalAssets = useMemo(() => {
    const counts = new Map();
    trades.forEach((trade) => {
      const asset = String(trade.asset ?? "").trim();
      if (asset) counts.set(asset, (counts.get(asset) || 0) + 1);
    });
    return [...counts].sort((left, right) => right[1] - left[1]).map(([asset]) => asset);
  }, [trades]);
  const unresolvedJournalAsset = useMemo(
    () => journalAssets.find((asset) => !resolveChartSymbol(asset, symbolMap) || !toTradingViewSymbol(asset, symbolMap)),
    [journalAssets, symbolMap],
  );
  const symbols = useMemo(() => [...new Set([...journalAssets, ...historicalAssetSuggestions])], [journalAssets]);
  const allVersions = useMemo(() => strategyLibrary.flatMap((strategy) => (
    (strategy.versions || []).map((version) => ({ strategy, version }))
  )), [strategyLibrary]);
  const selectedVersion = allVersions.find(({ strategy, version }) => (
    version.id === strategyVersionId && strategy.id === selectedStrategy?.id
  )) || null;
  const activeIndicators = useMemo(
    () => selectedVersion ? indicatorSpecs(selectedVersion.version) : [],
    [selectedVersion],
  );
  const tradingViewStudies = useMemo(
    () => studiesForVersion(selectedVersion?.version),
    [selectedVersion],
  );
  const tradingViewSymbol = toTradingViewSymbol(assetInput || symbol, symbolMap);
  const checkedForVersion = selectedVersion
    ? setupChecklist[selectedVersion.version.id]?.checked || {}
    : {};
  const sessionForVersion = selectedVersion
    ? setupChecklist[selectedVersion.version.id]?.session || selectedStrategy?.session || "New York"
    : selectedStrategy?.session || "New York";
  const bounds = useMemo(() => dateRange(range), [range]);
  const selectedTradeData = useMemo(() => {
    const mappedTrades = trades
      .filter((trade) => resolveChartSymbol(trade.asset, symbolMap) === symbol)
      .map((trade) => ({ ...trade, asset: symbol, originalTrade: trade }));
    const result = tradesToMarkers(mappedTrades, symbol, bounds);
    return {
      ...result,
      trades: result.trades.slice().sort((left, right) => (
        `${storedDate(right.date)} ${right.time || ""}`.localeCompare(`${storedDate(left.date)} ${left.time || ""}`)
      )),
    };
  }, [trades, symbol, symbolMap, bounds]);
  const supportedSymbol = Boolean(resolveChartSymbol(symbol, symbolMap));

  useEffect(() => {
    const next = { symbol, timeframe };
    writeSelection(next);
  }, [symbol, timeframe]);

  useEffect(() => {
    writeChartView(view);
  }, [view]);

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(setupChecklist));
    } catch {
      // Keep in-memory checklist state if storage is unavailable.
    }
  }, [setupChecklist]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setTradesExpanded(false);
    };
    const handlePointerDown = (event) => {
      if (tradeDropdown.current && !tradeDropdown.current.contains(event.target)) setTradesExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const invalidTimeframe = !SUPPORTED_TIMEFRAMES.includes(timeframe)
    ? `Unsupported timeframe "${timeframe}". Supported timeframes: ${SUPPORTED_TIMEFRAMES.join(", ")}.`
    : "";
  const requestKey = `${symbol}|${timeframe}|${bounds.startDate}|${bounds.endDate}|${refreshKey}`;
  const loading = view === "my-trades" && Boolean(symbol.trim()) && !invalidTimeframe && requestState.key !== requestKey;
  const error = invalidTimeframe
    || (!supportedSymbol ? "Map this asset to a supported chart symbol before loading Massive bars." : "")
    || (requestState.key === requestKey ? requestState.error : "");
  const bars = view === "my-trades" && requestState.key === requestKey ? requestState.bars : EMPTY_BARS;
  const indicatorComputations = useMemo(() => activeIndicators.map((item) => {
    if (!bars.length) return { item, output: null, error: "" };
    try {
      return { item, output: calculateIndicator(item, bars), error: "" };
    } catch (indicatorError) {
      return {
        item,
        output: null,
        error: indicatorError instanceof Error ? indicatorError.message : "Indicator configuration is invalid.",
      };
    }
  }), [activeIndicators, bars]);
  useEffect(() => {
    if (view !== "my-trades" || !supportedSymbol || invalidTimeframe) return undefined;
    const id = ++requestId.current;
    fetchHistoricalBars(symbol, timeframe, bounds.startDate, bounds.endDate)
      .then((result) => {
        if (id === requestId.current) setRequestState({ key: requestKey, bars: result, error: "" });
      })
      .catch((fetchError) => {
        if (id === requestId.current) {
          setRequestState({
            key: requestKey,
            bars: [],
            error: fetchError instanceof Error ? fetchError.message : "Historical bar request failed.",
          });
        }
      })
      .catch((unexpectedError) => {
        if (id === requestId.current) {
          setRequestState({
            key: requestKey,
            bars: [],
            error: unexpectedError instanceof Error ? unexpectedError.message : "Historical bar request failed.",
          });
        }
      });
    return () => { requestId.current += 1; };
  }, [bounds, invalidTimeframe, refreshKey, requestKey, symbol, timeframe, supportedSymbol, view]);

  function chooseSymbol(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    setAssetInput(raw);
    const nextSymbol = resolveChartSymbol(raw, symbolMap);
    setSymbol(nextSymbol || raw.toUpperCase());
    onAssetChange(nextSymbol || raw);
  }

  function saveSymbolMap(assetName) {
    const nextSymbol = String(pendingMapValue || "").trim();
    if (!assetName || !nextSymbol) return;
    const nextMap = { ...symbolMap, [assetName]: nextSymbol };
    setSymbolMap(nextMap);
    writeSymbolMap(nextMap);
    setPendingMapValue("");
    setAssetInput(assetName);
    const resolved = resolveChartSymbol(assetName, nextMap);
    if (resolved) {
      setSymbol(resolved);
      onAssetChange(resolved);
    }
  }

  function toggleChecklist(key) {
    if (!selectedVersion) return;
    const versionKey = selectedVersion.version.id;
    setSetupChecklist((previous) => {
      const current = previous[versionKey] || {};
      return {
        ...previous,
        [versionKey]: {
          ...current,
          checked: { ...(current.checked || {}), [key]: !current.checked?.[key] },
        },
      };
    });
  }

  function selectStrategy(nextStrategyId) {
    setStrategyId(nextStrategyId);
    const nextStrategy = strategyLibrary.find(({ id }) => id === nextStrategyId);
    setStrategyVersionChoice([...((nextStrategy?.versions) || [])].sort((left, right) => Number(right.version) - Number(left.version))[0]?.id || null);
  }

  const symbolTrades = useMemo(() => trades.filter((trade) => (
    resolveChartSymbol(trade.asset, symbolMap) === symbol
  )), [trades, symbol, symbolMap]);
  const dateFilteredTrades = useMemo(() => view === "my-trades"
    ? symbolTrades.filter((trade) => hasValidTradeDate(trade) && storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate)
    : symbolTrades, [bounds.endDate, bounds.startDate, symbolTrades, view]);
  const skipReasons = useMemo(() => ({
    date: symbolTrades.filter((trade) => !hasValidTradeDate(trade)).length,
    entry: symbolTrades.filter((trade) => hasValidTradeDate(trade) && (
      view !== "my-trades" || (storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate)
    ) && finite(trade.entry) === null).length,
    exit: symbolTrades.filter((trade) => hasValidTradeDate(trade) && (
      view !== "my-trades" || (storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate)
    ) && finite(trade.exit) === null).length,
  }), [bounds.endDate, bounds.startDate, symbolTrades, view]);
  const chartTradeList = dateFilteredTrades.slice().sort((left, right) => (
    `${storedDate(right.date)} ${right.time || ""}`.localeCompare(`${storedDate(left.date)} ${left.time || ""}`)
  ));
  const netPnl = chartTradeList.reduce((total, trade) => total + (finite(trade.pnl) || 0), 0);
  const skippedTrades = symbolTrades.filter((trade) => (
    !hasValidTradeDate(trade)
    || (hasValidTradeDate(trade) && (view !== "my-trades" || (
      storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate
    )) && (finite(trade.entry) === null || finite(trade.exit) === null))
  )).length;
  const journaledVisibleTrades = showTrades ? selectedTradeData.trades : [];
  const availableIndicators = indicatorComputations;
  const mapAsset = (!resolveChartSymbol(assetInput, symbolMap) || !toTradingViewSymbol(assetInput, symbolMap))
    ? assetInput
    : unresolvedJournalAsset;

  function logPlannedTrade(prefill) {
    onLogTrade(prefill);
    if (!selectedVersion) return;
    setSetupChecklist((previous) => {
      const next = { ...previous };
      delete next[selectedVersion.version.id];
      return next;
    });
  }

  return (
    <div className="trading-workspace">
      <section className="trading-workspace-card chart-toolbar">
        <div className="chart-view-switch" role="group" aria-label="Chart view">
          <button type="button" aria-pressed={view === "tradingview"} className={view === "tradingview" ? "selected" : ""} onClick={() => setView("tradingview")}>TradingView</button>
          <button type="button" aria-pressed={view === "my-trades"} className={view === "my-trades" ? "selected" : ""} onClick={() => setView("my-trades")}>My trades</button>
        </div>
        <label className="chart-symbol-control">Ticker
          <input aria-label="Symbol" list="chart-symbol-options" value={assetInput} onChange={(event) => setAssetInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") chooseSymbol(assetInput); }} placeholder="Search journal assets or enter ticker" />
          <datalist id="chart-symbol-options">{symbols.map((entry) => <option value={entry} key={entry} />)}</datalist>
        </label>
        <button type="button" className="add-trade-btn chart-go" onClick={() => chooseSymbol(assetInput)}>Go</button>
        {mapAsset && <div className="chart-symbol-map">
          <span>Map to chart symbol · {mapAsset}</span>
          <input aria-label={`Map ${mapAsset} to chart symbol`} value={pendingMapValue} onChange={(event) => setPendingMapValue(event.target.value)} placeholder="e.g. NAS100 or OANDA:XAUUSD" />
          <button type="button" onClick={() => saveSymbolMap(mapAsset)}>Save</button>
        </div>}
        <fieldset className="chart-timeframes"><legend>Timeframe</legend>{SUPPORTED_TIMEFRAMES.map((item) => <button key={item} type="button" className={timeframe === item ? "selected" : ""} aria-pressed={timeframe === item} onClick={() => setTimeframe(item)}>{TIMEFRAME_LABELS[item] || item}</button>)}</fieldset>
        {view === "my-trades" && <>
          <fieldset className="chart-range-picker"><legend>Date range</legend>{Object.keys(RANGE_DAYS).map((item) => <button key={item} type="button" className={range === item ? "selected" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</fieldset>
          <button type="button" className="secondary-btn chart-refresh" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>
        </>}
      </section>

      {view === "my-trades" && <div className="chart-source-meta"><span>Source: Massive via historical-data</span><span>Last bar: {bars.length ? new Date(bars[bars.length - 1].timestamp).toLocaleString("en-US") : "--"}</span><span>Historical bars · not live quotes</span></div>}

      <div className="chart-workspace-layout">
        <section className="trading-workspace-card chart-main-card" aria-label="Chart workspace">
          <div className="chart-card-heading">
            <div><p className="eyebrow">{view === "tradingview" ? "TRADINGVIEW · EMBEDDED CHART" : "HISTORICAL PRICE"}</p><h2>{tradingViewSymbol || symbol || "Select a symbol"} · {TIMEFRAME_LABELS[timeframe] || timeframe}</h2></div>
            {view === "my-trades" && <label className="chart-overlay-toggle"><input type="checkbox" checked={showTrades} onChange={(event) => setShowTrades(event.target.checked)} /> Journal markers</label>}
          </div>
          {view === "tradingview" ? tradingViewSymbol
            ? <TradingViewChart symbol={tradingViewSymbol} interval={TRADINGVIEW_INTERVALS[timeframe] || "D"} studies={tradingViewStudies} />
            : <div className="chart-empty-state" role="alert"><strong>Map this asset to a TradingView symbol</strong><p>No reliable symbol mapping exists for “{assetInput}”. Enter a symbol mapping above; the chart will not substitute another instrument.</p></div>
            : <>
              {crosshair && <div className="chart-crosshair-readout" aria-live="polite"><span>{crosshair.date || "--"}</span><span>O {crosshair.open?.toFixed(2) ?? "--"}</span><span>H {crosshair.high?.toFixed(2) ?? "--"}</span><span>L {crosshair.low?.toFixed(2) ?? "--"}</span><span>C {crosshair.close?.toFixed(2) ?? "--"}</span>{crosshair.trade && <span>{crosshair.trade.direction} · {formatPnl(finite(crosshair.trade.pnl))} · {crosshair.trade.strategy || "Unassigned"}{crosshair.trade.versionNumber ? ` v${crosshair.trade.versionNumber}` : ""}</span>}</div>}
              {loading ? <div className="chart-loading-shimmer" role="status">Loading historical bars…</div> : error ? <div className="chart-empty-state" role="alert"><strong>Historical data unavailable</strong><p>{error}</p><button type="button" className="secondary-btn" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div> : bars.length === 0 ? <div className="chart-empty-state"><strong>No bars in this range</strong><p>The provider returned no historical bars for {symbol} ({timeframe}, {bounds.startDate} to {bounds.endDate}).</p></div> : <ChartCanvas bars={bars} trades={journaledVisibleTrades} showTrades={showTrades} focusTradeDate={focusTradeDate} indicatorComputations={indicatorComputations.filter(({ output }) => output)} onViewTrade={onViewTrade} onCrosshair={setCrosshair} />}
            </>}
          {view === "my-trades" && availableIndicators.length > 0 && <div className="chart-indicator-status"><span>Selected version indicators</span>{availableIndicators.map(({ item, output, error: indicatorError }) => {
            const rendered = output?.pane === "price" ? "price chart" : output?.pane === "lower" ? "indicator pane" : "not computable";
            const status = output ? rendered : bars.length ? `not computable${indicatorError ? ` · ${indicatorError}` : ""}` : "waiting for bars";
            return <span className={`chart-indicator-chip ${output ? "" : "unavailable"}`} key={item.key}>{item.label}: {status}</span>;
          })}</div>}
          {view === "tradingview" && tradingViewStudies.length > 0 && <div className="chart-indicator-status"><span>Version indicators · manually review chart</span>{tradingViewStudies.map((study) => <span className={`chart-indicator-chip ${study.applied ? "" : "unavailable"}`} key={study.key}>{study.label}: {study.applied ? `applied · ${study.id}` : "check manually"}</span>)}</div>}
          {view === "tradingview" && <p className="chart-muted-note">Chart data is provided by TradingView. Indicators and setup conditions are not detected by this application.</p>}
        </section>

        <aside className="chart-side-panels">
          <section className="trading-workspace-card chart-strategy-card">
            <p className="eyebrow">STRATEGY · MANUAL REVIEW</p>
            <label>Strategy<select aria-label="Strategy" value={selectedStrategy?.id || ""} onChange={(event) => selectStrategy(event.target.value)}>{strategyLibrary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Version<select aria-label="Strategy version" value={selectedVersion?.version.id || ""} onChange={(event) => setStrategyVersionChoice(event.target.value || null)}><option value="">Select a version</option>{strategyVersions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}</select></label>
            {selectedVersion ? <>
              <h3>{selectedStrategy.name} · v{selectedVersion.version.version}</h3>
              <strong>Declared conditions and indicators</strong>
              {declaredConditions(selectedVersion.version).length ? <div className="chart-declared-items">{declaredConditions(selectedVersion.version).map((item) => <label className="setup-check-chip" key={item.key}>
                <input type="checkbox" checked={Boolean(checkedForVersion[item.key])} onChange={() => toggleChecklist(item.key)} />
                <span>{item.type} · {item.label}</span>
              </label>)}</div> : <p>No conditions or indicators are declared for this version.</p>}
              <p className="chart-muted-note">These are your manual observations; the chart does not detect conditions.</p>
            </> : <p>Select a strategy version to list its declared conditions and indicators.</p>}
          </section>
          <TradePlanPanel
            symbol={assetInput || symbol}
            strategy={selectedStrategy}
            version={selectedVersion?.version}
            session={sessionForVersion}
            checked={checkedForVersion}
            onToggle={toggleChecklist}
            onPlanChange={setPlanValues}
            onLogTrade={logPlannedTrade}
          />
        </aside>
      </div>

      <section className="trading-workspace-card chart-trades-list" ref={tradeDropdown}>
        <button type="button" className="chart-trades-trigger" aria-expanded={tradesExpanded} onClick={() => setTradesExpanded((expanded) => !expanded)}>
          <span><small className="eyebrow">JOURNAL OVERLAY</small><strong>Trades on this chart · {chartTradeList.length} trades · net {formatPnl(netPnl)}</strong></span>
          <span className={`chart-trades-chevron ${tradesExpanded ? "expanded" : ""}`} aria-hidden="true">⌄</span>
        </button>
        {tradesExpanded && <div className="chart-trades-dropdown">
          <p className="chart-trades-count">{chartTradeList.length} in range{skippedTrades ? ` · ${skippedTrades} skipped` : ""} · {symbolTrades.length} matching {symbol || "symbol"}</p>
          {skippedTrades > 0 && <p className="chart-muted-note">Skipped data: {skipReasons.date} missing date · {skipReasons.entry} missing entry · {skipReasons.exit} missing exit.</p>}
          {chartTradeList.length ? <div className="chart-trade-rows">{chartTradeList.map((trade) => <div key={trade.id} className="chart-trade-row">
            <span>{storedDate(trade.date) || "Date unavailable"} · {trade.direction || "Direction unavailable"}</span>
            <strong className={(finite(trade.pnl) ?? 0) >= 0 ? "positive" : "negative"}>{formatPnl(finite(trade.pnl))}</strong>
            <small>{trade.strategy ? `${trade.strategy}${(trade.versionNumber ?? trade.version_number) ? ` · v${trade.versionNumber ?? trade.version_number}` : ""}` : "No strategy"}</small>
            <button type="button" className="secondary-btn chart-trade-view" onClick={() => {
              if (view === "my-trades" && storedDate(trade.date)) setFocusTradeDate(storedDate(trade.date));
              onViewTrade(trade);
            }}>View</button>
          </div>)}</div> : <p className="chart-muted-note">No journaled trades for {symbol || "this symbol"} in this view.</p>}
        </div>}
      </section>
      <SetupExport symbol={assetInput || symbol} timeframe={timeframe} trades={symbolTrades} strategyVersion={selectedVersion?.version} plan={planValues} checked={checkedForVersion} />
    </div>
  );
}
