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
const SUPPORTED_TIMEFRAMES = supportedHistoricalTimeframes.map(({ value }) => value);
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

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
        onViewTrade(markerTrade);
        return;
      }
      const timestamp = typeof parameter.time === "number" ? parameter.time * 1000 : null;
      if (!timestamp) return;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const trade = markerTrades.trades.find((entry) => storedDate(entry.date) === date);
      if (trade) onViewTrade(trade);
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
}) {
  const [initial] = useState(() => readSelection());
  const [symbol, setSymbol] = useState(selectedAsset || initial.symbol);
  const [timeframe, setTimeframe] = useState(initial.timeframe);
  const [range, setRange] = useState("3M");
  const [requestState, setRequestState] = useState({ key: "", bars: [], error: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTrades, setShowTrades] = useState(true);
  const [strategyVersionId, setStrategyVersionId] = useState("");
  const [crosshair, setCrosshair] = useState(null);
  const [focusTradeDate, setFocusTradeDate] = useState("");
  const requestId = useRef(0);
  const journalAssets = useMemo(() => {
    const counts = new Map();
    trades.forEach((trade) => {
      const asset = String(trade.asset ?? "").trim().toUpperCase();
      if (asset) counts.set(asset, (counts.get(asset) || 0) + 1);
    });
    return [...counts].sort((left, right) => right[1] - left[1]).map(([asset]) => asset);
  }, [trades]);
  const symbols = useMemo(() => [...new Set([...journalAssets, ...historicalAssetSuggestions])], [journalAssets]);
  const allVersions = useMemo(() => strategyLibrary.flatMap((strategy) => (
    (strategy.versions || []).map((version) => ({ strategy, version }))
  )), [strategyLibrary]);
  const selectedVersion = allVersions.find(({ version }) => version.id === strategyVersionId) || null;
  const activeIndicators = useMemo(
    () => selectedVersion ? indicatorSpecs(selectedVersion.version) : [],
    [selectedVersion],
  );
  const bounds = useMemo(() => dateRange(range), [range]);
  const selectedTradeData = useMemo(() => {
    const result = tradesToMarkers(trades, symbol, bounds);
    return {
      ...result,
      trades: result.trades.slice().sort((left, right) => (
        `${storedDate(right.date)} ${right.time || ""}`.localeCompare(`${storedDate(left.date)} ${left.time || ""}`)
      )),
    };
  }, [trades, symbol, bounds]);
  const supportedSymbol = Boolean(symbol.trim());

  useEffect(() => {
    const next = { symbol, timeframe };
    writeSelection(next);
  }, [symbol, timeframe]);

  const invalidTimeframe = !SUPPORTED_TIMEFRAMES.includes(timeframe)
    ? `Unsupported timeframe "${timeframe}". Supported timeframes: ${SUPPORTED_TIMEFRAMES.join(", ")}.`
    : "";
  const requestKey = `${symbol}|${timeframe}|${bounds.startDate}|${bounds.endDate}|${refreshKey}`;
  const loading = Boolean(symbol.trim()) && !invalidTimeframe && requestState.key !== requestKey;
  const error = invalidTimeframe
    || (!symbol.trim() ? "Choose a symbol to load historical bars." : "")
    || (requestState.key === requestKey ? requestState.error : "");
  const bars = requestState.key === requestKey ? requestState.bars : EMPTY_BARS;
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
    if (!supportedSymbol || invalidTimeframe) return undefined;
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
  }, [bounds, invalidTimeframe, refreshKey, requestKey, symbol, timeframe, supportedSymbol]);

  function chooseSymbol(value) {
    const nextSymbol = value.toUpperCase();
    setSymbol(nextSymbol);
    onAssetChange(nextSymbol);
  }

  const barDates = new Set(bars.map((bar) => new Date(bar.timestamp).toISOString().slice(0, 10)));
  const missingTradeDataCount = showTrades ? selectedTradeData.skippedCount : 0;
  const missingBarCount = showTrades && !loading && !error
    ? selectedTradeData.trades.filter((trade) => !barDates.has(storedDate(trade.date))).length
    : 0;
  const skippedTrades = missingTradeDataCount + missingBarCount;
  const journaledVisibleTrades = showTrades ? selectedTradeData.trades : [];
  const chartTradeList = selectedTradeData.inRangeTrades;
  const availableIndicators = indicatorComputations;

  return (
    <div className="trading-workspace">
      <section className="trading-workspace-card chart-toolbar">
        <label className="chart-symbol-control">Symbol
          <input aria-label="Symbol" list="chart-symbol-options" value={symbol} onChange={(event) => chooseSymbol(event.target.value)} placeholder="Search journaled assets or enter a ticker" />
          <datalist id="chart-symbol-options">{symbols.map((entry) => <option value={entry} key={entry} />)}</datalist>
        </label>
        <fieldset className="chart-timeframes"><legend>Timeframe</legend>{SUPPORTED_TIMEFRAMES.map((item) => <button key={item} type="button" className={timeframe === item ? "selected" : ""} aria-pressed={timeframe === item} onClick={() => setTimeframe(item)}>{item}</button>)}</fieldset>
        <fieldset className="chart-range-picker"><legend>Date range</legend>{Object.keys(RANGE_DAYS).map((item) => <button key={item} type="button" className={range === item ? "selected" : ""} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</fieldset>
        <button type="button" className="secondary-btn chart-refresh" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>
      </section>

      <div className="chart-source-meta"><span>Source: Massive via historical-data</span><span>Last bar: {bars.length ? new Date(bars[bars.length - 1].timestamp).toLocaleString("en-US") : "--"}</span><span>Historical bars · not live quotes</span></div>

      <div className="chart-workspace-layout">
        <section className="trading-workspace-card chart-main-card" aria-label="Chart workspace">
          <div className="chart-card-heading">
            <div><p className="eyebrow">HISTORICAL PRICE</p><h2>{symbol || "Select a symbol"} · {timeframe}</h2></div>
            <label className="chart-overlay-toggle"><input type="checkbox" checked={showTrades} onChange={(event) => setShowTrades(event.target.checked)} /> My trades</label>
          </div>
          {crosshair && <div className="chart-crosshair-readout" aria-live="polite"><span>{crosshair.date || "--"}</span><span>O {crosshair.open?.toFixed(2) ?? "--"}</span><span>H {crosshair.high?.toFixed(2) ?? "--"}</span><span>L {crosshair.low?.toFixed(2) ?? "--"}</span><span>C {crosshair.close?.toFixed(2) ?? "--"}</span>{crosshair.trade && <span>{crosshair.trade.direction} · {finite(crosshair.trade.pnl) === null ? "P&L n/a" : `${finite(crosshair.trade.pnl) >= 0 ? "+" : "-"}$${Math.abs(finite(crosshair.trade.pnl)).toFixed(2)}`} · {crosshair.trade.strategy || "Unassigned"}{crosshair.trade.versionNumber ? ` v${crosshair.trade.versionNumber}` : ""}</span>}</div>}
          {loading ? <div className="chart-loading-shimmer" role="status">Loading historical bars…</div> : error ? <div className="chart-empty-state" role="alert"><strong>Historical data unavailable</strong><p>{error}</p><button type="button" className="secondary-btn" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div> : bars.length === 0 ? <div className="chart-empty-state"><strong>No bars in this range</strong><p>The provider returned no historical bars for {symbol} ({timeframe}, {bounds.startDate} to {bounds.endDate}).</p></div> : (
            <ChartCanvas bars={bars} trades={journaledVisibleTrades} showTrades={showTrades} focusTradeDate={focusTradeDate} indicatorComputations={indicatorComputations.filter(({ output }) => output)} onViewTrade={onViewTrade} onCrosshair={setCrosshair} />
          )}
          {skippedTrades > 0 && <small className="chart-muted-note">{missingTradeDataCount > 0 && `${missingTradeDataCount} ${missingTradeDataCount === 1 ? "trade lacks" : "trades lack"} a usable date, entry, or exit. `}{missingBarCount > 0 && `${missingBarCount} ${missingBarCount === 1 ? "trade has" : "trades have"} no matching bar in this range.`}</small>}
          {availableIndicators.length > 0 && <div className="chart-indicator-status"><span>Selected version indicators</span>{availableIndicators.map(({ item, output, error: indicatorError }) => {
            const { key, label } = item;
            const rendered = key === "smaConfirmation" || key === "emaConfirmation" || key === "bollingerConfirmation" || key === "fibonacciConfirmation" || key === "ichimokuConfirmation"
              ? "price chart"
              : key === "rsiConfirmation" || key === "macdConfirmation" || key === "adxConfirmation" || key === "stdDevConfirmation" || key === "stochasticConfirmation"
                ? "indicator pane"
                : "";
            const status = output ? rendered || "not computable" : bars.length ? `not computable${indicatorError ? ` · ${indicatorError}` : ""}` : "waiting for bars";
            return <span className={`chart-indicator-chip ${output ? "" : "unavailable"}`} key={key}>{label}: {status}</span>;
          })}</div>}
        </section>
        {allVersions.length > 0 && <aside className="trading-workspace-card chart-strategy-card">
          <label>Strategy version<select aria-label="Strategy version" value={strategyVersionId} onChange={(event) => setStrategyVersionId(event.target.value)}><option value="">Select a version</option>{allVersions.map(({ strategy, version }) => <option key={version.id} value={version.id}>{strategy.name} · v{version.version}</option>)}</select></label>
          {selectedVersion ? <><h3>{selectedVersion.strategy.name} · v{selectedVersion.version.version}</h3><strong>Declared setup conditions and indicators</strong><ul>{declaredConditions(selectedVersion.version).map((condition) => <li key={condition.key}>{condition.type} · {condition.label}</li>)}</ul></> : <p>Select a version to show its declared conditions and indicators.</p>}
        </aside>}
      </div>

      <section className="trading-workspace-card chart-trades-list">
        <div className="chart-card-heading"><div><p className="eyebrow">JOURNAL OVERLAY</p><h2>Trades on this chart</h2></div><span>{chartTradeList.length} in range{skippedTrades ? ` · ${skippedTrades} skipped` : ""}</span></div>
        {chartTradeList.length ? <div className="chart-trade-rows">{chartTradeList.map((trade) => <button key={trade.id} type="button" className="chart-trade-row" onClick={() => { setFocusTradeDate(storedDate(trade.date)); onViewTrade(trade); }}><span>{trade.date} · {trade.direction}</span><strong className={(finite(trade.pnl) ?? 0) >= 0 ? "positive" : "negative"}>{finite(trade.pnl) === null ? "P&L not recorded" : `${finite(trade.pnl) >= 0 ? "+" : "-"}$${Math.abs(finite(trade.pnl)).toFixed(2)}`}</strong><small>{trade.strategy || "Unassigned"}{trade.versionNumber ? ` · v${trade.versionNumber}` : ""}</small></button>)}</div> : <p className="chart-muted-note">No journaled trades for {symbol || "this symbol"} in the selected range.</p>}
      </section>
      <SetupExport symbol={symbol} timeframe={timeframe} trades={journaledVisibleTrades} strategyVersion={selectedVersion?.version} />
    </div>
  );
}
