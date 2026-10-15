import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketBars } from "../services/useMarketData";
import { readSymbolMap, resolveChartSymbol, writeSymbolMap } from "../services/symbolMap";
import { suggestKnownSymbol } from "../services/tradeAssetSuggestions";
import { tradeChartLevels, tradeChartTimeframe, tradeChartTimeframes, tradeChartWindow, tradeChartEntryTimestamp } from "../services/tradeChart";
import { tradeIndicatorComputations } from "../services/tradeChartIndicators";
import PriceChart from "./PriceChart";

const EMPTY_BARS = [];

function displayNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—";
}

function displayPnl(value) {
  return value === null ? "P&L not recorded" : `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function findStrategyVersion(trade, strategyLibrary) {
  if (!trade?.strategyVersionId) return null;
  return strategyLibrary
    .flatMap((strategy) => (strategy.versions || []).map((version) => ({ ...version, strategyName: strategy.name })))
    .find((version) => version.id === trade.strategyVersionId) || null;
}

function TradeLevels({ trade }) {
  const { levels, riskReward, pnl } = tradeChartLevels(trade);
  const sorted = [...levels].sort((left, right) => right.value - left.value);
  return (
    <div className="trade-levels-diagram" aria-label="Trade levels">
      <h3>Trade levels</h3>
      {sorted.length
        ? <div className="trade-level-ladder">
          {sorted.map(({ key, label, value, color }) => (
            <div className="trade-level-rung" key={key}>
              <span className="trade-level-marker" style={{ backgroundColor: color }} />
              <span>{label}</span>
              <strong>{displayNumber(value)}</strong>
            </div>
          ))}
        </div>
        : <p>No trade prices were recorded.</p>}
      <div className="trade-level-summary">
        <span>R:R <strong>{riskReward === null ? "—" : `${displayNumber(riskReward)}:1`}</strong></span>
        <span>P&amp;L <strong>{displayPnl(pnl)}</strong></span>
      </div>
      <p className="trade-chart-note">No price bars for this symbol on your data plan — showing your journaled levels only.</p>
    </div>
  );
}

export default function TradeChartOverview({ trade, strategyLibrary = [] }) {
  const [symbolMap, setSymbolMap] = useState(() => readSymbolMap());
  const [mappingInput, setMappingInput] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [timeframe, setTimeframe] = useState(() => tradeChartTimeframe(trade));
  const [request, setRequest] = useState({ key: "", bars: [], error: "" });
  const [refreshToken, setRefreshToken] = useState(0);
  const requestId = useRef(0);
  const timeframes = tradeChartTimeframes();
  const rawAsset = String(trade?.asset ?? "").trim();
  const userMappedSymbol = symbolMap[rawAsset]
    || symbolMap[rawAsset.toUpperCase()]
    || symbolMap[rawAsset.toLowerCase()];
  const mapped = resolveChartSymbol(trade?.asset, symbolMap);
  const suggestion = suggestKnownSymbol(trade?.asset);
  const isUnrecognized = Boolean(suggestion && !userMappedSymbol);
  const symbol = mapped || String(trade?.asset ?? "").trim().toUpperCase();
  const window = useMemo(() => tradeChartWindow(trade, timeframe), [trade, timeframe]);
  const requestKey = `${symbol}|${timeframe}|${window?.startDate || ""}|${window?.endDate || ""}|${refreshToken}`;
  const loading = Boolean(symbol) && !isUnrecognized && Boolean(window) && request.key !== requestKey;
  const error = request.key === requestKey ? request.error : "";
  const allBars = request.key === requestKey ? request.bars : EMPTY_BARS;
  const bars = useMemo(() => window
    ? allBars.filter((bar) => bar.timestamp >= window.startTimestamp && bar.timestamp <= window.endTimestamp)
    : [], [allBars, window]);
  const strategyVersion = findStrategyVersion(trade, strategyLibrary);
  const indicatorComputations = useMemo(
    () => tradeIndicatorComputations(strategyVersion, bars),
    [strategyVersion, bars],
  );

  useEffect(() => {
    if (!symbol || isUnrecognized || !window) return undefined;
    const id = ++requestId.current;
    const controller = new AbortController();
    fetchMarketBars(symbol, timeframe, {
      signal: controller.signal,
      startDate: window.startDate,
      endDate: window.endDate,
      bypassCache: refreshToken > 0,
    }).then(({ bars: fetchedBars }) => {
      if (id === requestId.current) setRequest({ key: requestKey, bars: fetchedBars, error: "" });
    }).catch((fetchError) => {
      if (id !== requestId.current || fetchError?.name === "AbortError") return;
      setRequest({
        key: requestKey,
        bars: [],
        error: fetchError instanceof Error ? fetchError.message : "Historical bars could not be loaded.",
      });
    });
    return () => {
      requestId.current += 1;
      controller.abort();
    };
  }, [isUnrecognized, requestKey, refreshToken, symbol, timeframe, window]);

  function saveMapping(nextSymbol) {
    const exactSymbol = String(nextSymbol ?? "").trim().toUpperCase();
    if (!exactSymbol) return;
    const nextMap = { ...symbolMap, [trade.asset]: exactSymbol };
    if (!writeSymbolMap(nextMap)) {
      setMappingError("Could not save the symbol mapping in browser storage. Check storage settings and try again.");
      return;
    }
    setSymbolMap(nextMap);
    setMappingInput("");
    setMappingError("");
    setRequest({ key: "", bars: [], error: "" });
  }

  return (
    <section className="detail-section trade-chart-overview" aria-label="Trade chart">
      <div className="trade-chart-heading">
        <div>
          <p className="eyebrow">TRADE CHART</p>
          <h3>Trade chart · {symbol || "Unknown symbol"} · {timeframe}</h3>
        </div>
        <div className="trade-chart-timeframes" role="group" aria-label="Trade chart timeframe">
          {timeframes.map((value) => <button
            type="button"
            key={value}
            aria-pressed={timeframe === value}
            className={timeframe === value ? "selected" : ""}
            onClick={() => setTimeframe(value)}
          >{value}</button>)}
        </div>
      </div>

      <p className="trade-chart-source">Historical bars via Massive · not live quotes</p>
      {isUnrecognized && <div className="trade-symbol-mapping">
        <p>Unrecognized asset &quot;{trade.asset}&quot;.</p>
        <button type="button" className="secondary-btn" onClick={() => saveMapping(suggestion)}>Did you mean {suggestion}?</button>
        <label>Map to symbol<input aria-label="Map to symbol" value={mappingInput} onChange={(event) => setMappingInput(event.target.value)} placeholder="Enter exact ticker" /></label>
        <button type="button" className="secondary-btn" onClick={() => saveMapping(mappingInput)}>Save mapping</button>
        {mappingError && <p role="alert">{mappingError}</p>}
      </div>}
      {loading && <div className="chart-loading-shimmer trade-chart-loading" role="status">Loading historical bars…</div>}
      {!isUnrecognized && error && <div className="chart-empty-state trade-chart-error" role="alert">
        <strong>Historical data unavailable</strong>
        <p>{error}</p>
        <button type="button" className="secondary-btn" onClick={() => setRefreshToken((value) => value + 1)}>Retry</button>
      </div>}
      {!isUnrecognized && !loading && !error && bars.length === 0 && <TradeLevels trade={trade} />}
      {!isUnrecognized && !loading && !error && bars.length > 0 && <>
        <div className="trade-chart-legend">
          <span>{String(trade.date || "Date not recorded")}{trade.time ? ` · ${trade.time} UTC` : ""}</span>
          <span>{trade.direction || "Direction not recorded"}</span>
          <span>{displayPnl(tradeChartLevels(trade).pnl)}</span>
          <span>R:R {tradeChartLevels(trade).riskReward === null ? "—" : `${displayNumber(tradeChartLevels(trade).riskReward)}:1`}</span>
        </div>
        <PriceChart
          bars={bars}
          trade={{ ...trade, entryTimestamp: tradeChartEntryTimestamp(trade) }}
          indicatorComputations={indicatorComputations}
          height={360}
        />
        {strategyVersion && indicatorComputations.length > 0 && <div className="trade-chart-indicators">
          <span>Strategy indicators · {strategyVersion.strategyName} v{strategyVersion.version}</span>
          {indicatorComputations.map(({ item, output, error: indicatorError }) => (
            <span className={`chart-indicator-chip ${output ? "" : "unavailable"}`} key={item.key}>
              {item.label}: {output ? output.pane === "price" ? "price chart" : "indicator pane" : `not computable${indicatorError ? ` · ${indicatorError}` : ""}`}
            </span>
          ))}
        </div>}
      </>}
    </section>
  );
}
