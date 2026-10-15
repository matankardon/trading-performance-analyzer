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
import { INDICATORS } from "../constants/strategyOptions";
import { fetchMarketBars } from "../services/useMarketData";
import { priceLinesForTrade, tradesToMarkers } from "../services/chartOverlay";
import {
  readSymbolMap,
  readTradingViewSymbolMap,
  resolveChartSymbol,
  resolveDefaultChartSelection,
  writeSymbolMap,
} from "../services/symbolMap";
import { suggestKnownSymbol } from "../services/tradeAssetSuggestions";
import { indicatorChipText, studiesForVersion } from "../services/tradingViewStudies";
import TradingViewChart from "./TradingViewChart";
import JournalTradesTimeline from "./JournalTradesTimeline";
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

const VIEW_STORAGE_KEY = "tradeCatalystChartView";
const TRADINGVIEW_INTERVAL = "15";
const HISTORICAL_TIMEFRAME = "15m";
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

function makeSetupSnapshot(symbol, timeframe, trades, version) {
  return normalizeSetupSnapshot({
    symbol,
    timeframe,
    timestamp: new Date().toISOString(),
    setupConditions: Object.entries(version?.conditions || {}).filter(([key, value]) => (
      key !== "indicatorSettings" && value === true
    )).map(([key]) => key),
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

function SetupExport({ symbol, timeframe, trades, strategyVersion }) {
  const [message, setMessage] = useState("");
  const snapshot = makeSetupSnapshot(symbol, timeframe, trades, strategyVersion);
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
  onPageChange = () => {},
}) {
  const [symbolMap, setSymbolMap] = useState(() => readSymbolMap());
  const [tradingViewSymbolMap] = useState(() => readTradingViewSymbolMap());
  const [defaultSelection] = useState(() => resolveDefaultChartSelection(
    selectedAsset,
    trades,
    symbolMap,
    tradingViewSymbolMap,
  ));
  const [symbol, setSymbol] = useState(defaultSelection.chartSymbol);
  const [selectedTradeAsset, setSelectedTradeAsset] = useState(defaultSelection.asset);
  const [mappingInput, setMappingInput] = useState("");
  const [mappingError, setMappingError] = useState("");
  const timeframe = HISTORICAL_TIMEFRAME;
  const [view, setView] = useState(readChartView);
  const [range, setRange] = useState("3M");
  const [requestState, setRequestState] = useState({ key: "", bars: [], error: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTrades, setShowTrades] = useState(true);
  const [strategyId, setStrategyId] = useState(strategyLibrary[0]?.id || "");
  const [strategyVersionChoice, setStrategyVersionChoice] = useState();
  const [crosshair, setCrosshair] = useState(null);
  const [focusTradeDate, setFocusTradeDate] = useState("");
  const [tradesExpanded, setTradesExpanded] = useState(false);
  const [tradeAssetFilter, setTradeAssetFilter] = useState("all");
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
  const selectedVersion = strategyVersions.find((version) => version.id === strategyVersionId) || null;
  const activeIndicators = useMemo(
    () => selectedVersion ? indicatorSpecs(selectedVersion) : [],
    [selectedVersion],
  );
  const tradingViewStudyMapping = useMemo(
    () => studiesForVersion(selectedVersion),
    [selectedVersion],
  );
  const tradingViewStudies = tradingViewStudyMapping.studies;
  const tradingViewSymbol = defaultSelection.tradingViewSymbol;
  const bounds = useMemo(() => dateRange(range), [range]);
  const userMappedSymbol = symbolMap[selectedTradeAsset]
    || symbolMap[selectedTradeAsset.toUpperCase()]
    || symbolMap[selectedTradeAsset.toLowerCase()];
  const suggestedSymbol = userMappedSymbol ? null : suggestKnownSymbol(selectedTradeAsset);
  const selectedAssetResolved = resolveChartSymbol(selectedTradeAsset, symbolMap);
  const needsSymbolMapping = Boolean(suggestedSymbol || !selectedAssetResolved);
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
  const supportedSymbol = Boolean(resolveChartSymbol(symbol, symbolMap)) && !suggestedSymbol;
  const bypassCacheRef = useRef(false);

  useEffect(() => {
    writeChartView(view);
  }, [view]);

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

  const requestKey = `${symbol}|${timeframe}|${bounds.startDate}|${bounds.endDate}|${refreshKey}`;
  const loading = view === "my-trades" && Boolean(symbol.trim()) && supportedSymbol && requestState.key !== requestKey;
  const error = requestState.key === requestKey ? requestState.error : "";
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
    if (view !== "my-trades" || !supportedSymbol) return undefined;
    const id = ++requestId.current;
    const controller = new AbortController();
    const bypassCache = bypassCacheRef.current;
    bypassCacheRef.current = false;
    fetchMarketBars(symbol, timeframe, {
      signal: controller.signal,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      bypassCache,
    })
      .then(({ bars: result }) => {
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
      });
    return () => {
      requestId.current += 1;
      controller.abort();
    };
  }, [bounds, refreshKey, requestKey, symbol, timeframe, supportedSymbol, view]);

  function selectStrategy(nextStrategyId) {
    setStrategyId(nextStrategyId);
    const nextStrategy = strategyLibrary.find(({ id }) => id === nextStrategyId);
    setStrategyVersionChoice([...((nextStrategy?.versions) || [])].sort((left, right) => Number(right.version) - Number(left.version))[0]?.id || null);
  }

  const symbolTrades = useMemo(() => trades.filter((trade) => (
    resolveChartSymbol(trade.asset, symbolMap) === symbol
  )), [trades, symbol, symbolMap]);
  const filteredAssetTrades = useMemo(() => tradeAssetFilter === "all"
    ? trades
    : trades.filter((trade) => String(trade.asset ?? "").trim() === tradeAssetFilter),
  [tradeAssetFilter, trades]);
  const dateFilteredTrades = useMemo(() => view === "my-trades"
    ? filteredAssetTrades.filter((trade) => !hasValidTradeDate(trade) || (storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate))
    : filteredAssetTrades, [bounds.endDate, bounds.startDate, filteredAssetTrades, view]);
  const skipReasons = useMemo(() => ({
    date: filteredAssetTrades.filter((trade) => !hasValidTradeDate(trade)).length,
    entry: filteredAssetTrades.filter((trade) => hasValidTradeDate(trade) && (
      view !== "my-trades" || (storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate)
    ) && finite(trade.entry) === null).length,
    exit: filteredAssetTrades.filter((trade) => hasValidTradeDate(trade) && (
      view !== "my-trades" || (storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate)
    ) && finite(trade.exit) === null).length,
  }), [bounds.endDate, bounds.startDate, filteredAssetTrades, view]);
  const chartTradeList = dateFilteredTrades.slice().sort((left, right) => (
    `${storedDate(right.date)} ${right.time || ""}`.localeCompare(`${storedDate(left.date)} ${left.time || ""}`)
  ));
  const timelineTradeList = trades
    .filter((trade) => String(trade.asset ?? "").trim() === selectedTradeAsset)
    .filter((trade) => !hasValidTradeDate(trade) || (
      storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate
    ))
    .slice()
    .sort((left, right) => (
      `${storedDate(left.date)} ${left.time || ""}`.localeCompare(`${storedDate(right.date)} ${right.time || ""}`)
    ));
  const netPnl = chartTradeList.reduce((total, trade) => total + (finite(trade.pnl) || 0), 0);
  const skippedTrades = filteredAssetTrades.filter((trade) => (
    !hasValidTradeDate(trade)
    || (hasValidTradeDate(trade) && (view !== "my-trades" || (
      storedDate(trade.date) >= bounds.startDate && storedDate(trade.date) <= bounds.endDate
    )) && (finite(trade.entry) === null || finite(trade.exit) === null))
  )).length;
  const journaledVisibleTrades = showTrades ? selectedTradeData.trades : [];
  const availableIndicators = indicatorComputations;

  function selectTradeAsset(asset) {
    setTradeAssetFilter(asset);
    setSelectedTradeAsset(asset);
    setMappingInput("");
    setMappingError("");
    if (view !== "my-trades" || !asset) return;
    const nextSymbol = resolveChartSymbol(asset, symbolMap) || asset.toUpperCase();
    setSymbol(nextSymbol);
    onAssetChange(asset);
  }

  function saveAssetMapping(nextSymbol) {
    const cleaned = String(nextSymbol || "").trim().toUpperCase();
    if (!cleaned || !selectedTradeAsset) return;
    const nextMap = { ...symbolMap, [selectedTradeAsset]: cleaned };
    if (writeSymbolMap(nextMap)) {
      setSymbolMap(nextMap);
      setSymbol(cleaned);
      setMappingInput("");
      setMappingError("");
    } else {
      setMappingError("Could not save the symbol mapping in browser storage. Check storage settings and try again.");
    }
  }

  function refreshBars() {
    bypassCacheRef.current = true;
    setRefreshKey((value) => value + 1);
  }

  return (
    <div className="trading-workspace">
      <section className="trading-workspace-card chart-strategy-toolbar" aria-label="Chart strategy studies">
        <label>Strategy<select aria-label="Strategy" value={selectedStrategy?.id || ""} onChange={(event) => selectStrategy(event.target.value)}>{strategyLibrary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Version<select aria-label="Strategy version" value={selectedVersion?.id || ""} onChange={(event) => setStrategyVersionChoice(event.target.value || null)}><option value="">Select a version</option>{strategyVersions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}</select></label>
        <div className="chart-strategy-status">
          <div className="chart-indicator-status">
            <span>Studies · manual review</span>
            {tradingViewStudyMapping.indicators.map((indicator) => <span className={`chart-indicator-chip ${indicator.status === "sent" ? "" : "unavailable"}`} key={indicator.key}>{indicatorChipText(indicator)}</span>)}
            {tradingViewStudyMapping.manualConditions.map((condition) => <span className="chart-indicator-chip unavailable" key={condition.key}>{condition.label}: Check manually</span>)}
          </div>
          {tradingViewStudyMapping.manualOnly && <div className="chart-manual-indicators">
            <span>This strategy declares no chart indicators (only manual conditions). Add indicators in Strategy Lab to see them here.</span>
            <button type="button" className="secondary-btn" onClick={() => onPageChange("Strategy Lab")}>Open Strategy Lab</button>
          </div>}
          <span className="chart-muted-note chart-indicator-guidance">If an indicator isn’t visible, add it with the chart’s Indicators button.</span>
        </div>
        <div className="chart-view-switch" role="group" aria-label="Chart view">
          <button type="button" aria-pressed={view === "tradingview"} className={view === "tradingview" ? "selected" : ""} onClick={() => setView("tradingview")}>TradingView</button>
          <button type="button" aria-pressed={view === "my-trades"} className={view === "my-trades" ? "selected" : ""} onClick={() => setView("my-trades")}>My trades</button>
        </div>
      </section>

      <div className="chart-workspace-layout">
        <section className="trading-workspace-card chart-main-card" aria-label="Chart workspace">
          <div className="chart-card-heading">
            <div><p className="eyebrow">{view === "tradingview" ? "TRADINGVIEW · EMBEDDED CHART" : "HISTORICAL PRICE"}</p><h2>{view === "tradingview" ? "TradingView chart" : `${symbol} · ${timeframe}`}</h2></div>
            {view === "my-trades" && <div className="chart-my-trades-controls">
              <label className="chart-asset-picker">Journal asset
                <select aria-label="Journal asset" value={selectedTradeAsset} onChange={(event) => selectTradeAsset(event.target.value)}>
                  {!journalAssets.includes(selectedTradeAsset) && <option value={selectedTradeAsset}>{selectedTradeAsset} · {selectedAssetResolved || "Unrecognized asset"}</option>}
                  {journalAssets.map((asset) => {
                    const mapped = resolveChartSymbol(asset, symbolMap);
                    const suspicious = !symbolMap[asset] && suggestKnownSymbol(asset);
                    return <option key={asset} value={asset}>{asset} · {suspicious ? "Unrecognized asset" : mapped || "Unrecognized asset"}</option>;
                  })}
                </select>
              </label>
              {needsSymbolMapping && <div className="chart-symbol-mapping">
                <p>Unrecognized asset &quot;{selectedTradeAsset}&quot;.</p>
                {mappingError && <p role="alert">{mappingError}</p>}
                {suggestedSymbol && <button type="button" className="secondary-btn" onClick={() => saveAssetMapping(suggestedSymbol)}>Did you mean {suggestedSymbol}?</button>}
                <label>Map to symbol<input aria-label="Map to symbol" value={mappingInput} onChange={(event) => setMappingInput(event.target.value)} placeholder="Enter exact ticker" /></label>
                <button type="button" className="secondary-btn" onClick={() => saveAssetMapping(mappingInput)}>Save mapping</button>
              </div>}
              <fieldset className="chart-range-picker"><legend>Date range</legend>{Object.keys(RANGE_DAYS).map((item) => <button key={item} type="button" className={range === item ? "selected" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</fieldset>
              <button type="button" className="secondary-btn chart-refresh" onClick={refreshBars}>Refresh</button>
              <label className="chart-overlay-toggle"><input type="checkbox" checked={showTrades} onChange={(event) => setShowTrades(event.target.checked)} /> Journal markers</label>
            </div>}
          </div>
          {view === "tradingview"
            ? <TradingViewChart symbol={tradingViewSymbol} interval={TRADINGVIEW_INTERVAL} studies={tradingViewStudies} />
            : <>
              {crosshair && <div className="chart-crosshair-readout" aria-live="polite"><span>{crosshair.date || "--"}</span><span>O {crosshair.open?.toFixed(2) ?? "--"}</span><span>H {crosshair.high?.toFixed(2) ?? "--"}</span><span>L {crosshair.low?.toFixed(2) ?? "--"}</span><span>C {crosshair.close?.toFixed(2) ?? "--"}</span>{crosshair.trade && <span>{crosshair.trade.direction} · {formatPnl(finite(crosshair.trade.pnl))} · {crosshair.trade.strategy || "Unassigned"}{crosshair.trade.versionNumber ? ` v${crosshair.trade.versionNumber}` : ""}</span>}</div>}
              {loading ? <div className="chart-loading-shimmer" role="status">Loading historical bars…</div> : error ? <div className="chart-empty-state" role="alert"><strong>Historical data unavailable</strong><p>{error}</p><button type="button" className="secondary-btn" onClick={refreshBars}>Retry</button></div> : bars.length === 0 ? <JournalTradesTimeline trades={timelineTradeList} /> : <ChartCanvas bars={bars} trades={journaledVisibleTrades} showTrades={showTrades} focusTradeDate={focusTradeDate} indicatorComputations={indicatorComputations.filter(({ output }) => output)} onViewTrade={onViewTrade} onCrosshair={setCrosshair} />}
            </>}
          {view === "my-trades" && <div className="chart-source-meta"><span>Source: Massive via historical-data</span><span>Last bar: {bars.length ? new Date(bars[bars.length - 1].timestamp).toLocaleString("en-US") : "--"}</span><span>Historical bars · not live quotes</span></div>}
          {view === "my-trades" && availableIndicators.length > 0 && <div className="chart-indicator-status"><span>Selected version indicators</span>{availableIndicators.map(({ item, output, error: indicatorError }) => {
            const rendered = output?.pane === "price" ? "price chart" : output?.pane === "lower" ? "indicator pane" : "not computable";
            const status = output ? rendered : bars.length ? `not computable${indicatorError ? ` · ${indicatorError}` : ""}` : "waiting for bars";
            return <span className={`chart-indicator-chip ${output ? "" : "unavailable"}`} key={item.key}>{item.label}: {status}</span>;
          })}</div>}
          {view === "tradingview" && <>
            <p className="chart-muted-note">Chart data is provided by TradingView. Indicators and setup conditions are not detected by this application.</p>
            <p className="chart-drawings-note">Drawings made on this chart are not saved and are cleared when you change symbol or timeframe. To keep them: take a screenshot (or use the chart&apos;s snapshot button) and attach it to a trade.</p>
          </>}
        </section>
      </div>

      <section className="trading-workspace-card chart-trades-list" ref={tradeDropdown}>
        <button type="button" className="chart-trades-trigger" aria-expanded={tradesExpanded} onClick={() => setTradesExpanded((expanded) => !expanded)}>
          <span><small className="eyebrow">JOURNAL TRADES</small><strong>Trades on this chart · {chartTradeList.length} trades · net {formatPnl(netPnl)}</strong></span>
          <span className={`chart-trades-chevron ${tradesExpanded ? "expanded" : ""}`} aria-hidden="true">⌄</span>
        </button>
        {tradesExpanded && <div className="chart-trades-dropdown">
          <label className="chart-trade-asset-filter">Filter by asset
            <select aria-label="Filter trades by asset" value={tradeAssetFilter} onChange={(event) => selectTradeAsset(event.target.value)}>
              <option value="all">All assets</option>
              {journalAssets.map((asset) => <option value={asset} key={asset}>{asset}</option>)}
            </select>
          </label>
          <p className="chart-trades-count">{chartTradeList.length} trades{view === "my-trades" ? " in range" : ""}{skippedTrades ? ` · ${skippedTrades} skipped` : ""} · {tradeAssetFilter === "all" ? "All assets" : tradeAssetFilter}</p>
          {skippedTrades > 0 && <p className="chart-muted-note">Skipped data: {skipReasons.date} missing date · {skipReasons.entry} missing entry · {skipReasons.exit} missing exit.</p>}
          {chartTradeList.length ? <div className="chart-trade-rows">{chartTradeList.map((trade) => <div key={trade.id} className="chart-trade-row">
            <span>{storedDate(trade.date) || "Date unavailable"} · {trade.direction || "Direction unavailable"}</span>
            <strong className={(finite(trade.pnl) ?? 0) >= 0 ? "positive" : "negative"}>{formatPnl(finite(trade.pnl))}</strong>
            <small>{trade.strategy ? `${trade.strategy}${(trade.versionNumber ?? trade.version_number) ? ` · v${trade.versionNumber ?? trade.version_number}` : ""}` : "No strategy"}</small>
            <button type="button" className="secondary-btn chart-trade-view" onClick={() => {
              if (view === "my-trades" && storedDate(trade.date)) setFocusTradeDate(storedDate(trade.date));
              onViewTrade(trade);
            }}>View</button>
          </div>)}</div> : <p className="chart-muted-note">No journaled trades for {tradeAssetFilter === "all" ? "all assets" : tradeAssetFilter} in this view.</p>}
        </div>}
      </section>
      {view === "my-trades" && <SetupExport symbol={symbol} timeframe={timeframe} trades={symbolTrades} strategyVersion={selectedVersion} />}
    </div>
  );
}
